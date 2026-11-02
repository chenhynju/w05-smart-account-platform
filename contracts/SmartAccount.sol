// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title Immutable threshold account with revocable scoped sessions and delayed guardians.
/// @dev Local/alternative-mempool account. ERC-7562 public mempool compatibility is a separate gate.
contract SmartAccount is BaseAccount {
    struct Action {
        address target;
        uint256 value;
        bytes data;
    }

    struct Session {
        address target;
        bytes4 selector;
        uint48 validUntil;
        uint256 remaining;
        uint256 epoch;
    }

    struct Permit {
        uint256 epoch;
        address signer;
        uint8 mode;
    }
    IEntryPoint private immutable _entryPoint;
    uint256 public epoch = 1;
    mapping(address => bool) public owners;
    address[] private _owners;
    uint256 public threshold = 1;
    mapping(address => Session) public sessions;
    mapping(bytes32 => Permit) private _permits;
    mapping(address => bool) public guardians;
    address[] private _guardians;
    uint256 public guardianThreshold = 1;
    uint48 public constant RECOVERY_DELAY = 2 days;
    bytes32 public recoveryId;
    address public recoveryOwner;
    uint48 public recoveryReadyAt;
    uint256 public recoveryVotes;
    uint256 public recoverySequence;

    struct Recovery {
        address owner;
        uint48 readyAt;
        uint256 votes;
        uint256 policyEpoch;
        bool active;
    }
    mapping(bytes32 => Recovery) public recoveryProposals;
    mapping(bytes32 => mapping(address => bool)) private _voted;
    bytes32 public passkeyX;
    bytes32 public passkeyY;
    bytes32 public rpIdHash;
    string public passkeyOrigin;
    uint256 public passkeyEpoch;
    bool private _executing;

    error Unauthorized();
    error InvalidPolicy();
    error StaleAuthorization();
    error CallFailed(uint256 index, bytes reason);
    error SessionDenied();
    error RecoveryNotReady();
    event PolicyChanged(uint256 indexed epoch);
    event OwnersConfigured(address[] owners, uint256 threshold);
    event GuardiansConfigured(address[] guardians, uint256 threshold);
    event PasskeyConfigured(bytes32 x, bytes32 y, bytes32 rpIdHash, string origin);
    event PasskeyRevoked(uint256 epoch);
    event SessionRevoked(address indexed key);
    event SessionConfigured(address indexed key, address target, bytes4 selector, uint48 validUntil, uint256 budget);
    event RecoveryProposed(bytes32 indexed id, address indexed replacement, uint48 readyAt);
    event RecoveryApproved(bytes32 indexed id, address indexed guardian);
    event RecoveryCompleted(address indexed owner, uint256 epoch);
    event Executed(uint256 indexed nonce, bytes32 indexed payloadHash);

    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    constructor(IEntryPoint ep, address owner, address guardian) {
        if (address(ep).code.length == 0 || owner == address(0) || guardian == address(0)) revert InvalidPolicy();
        _entryPoint = ep;
        owners[owner] = true;
        _owners.push(owner);
        guardians[guardian] = true;
        _guardians.push(guardian);
    }
    receive() external payable {}

    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    function ownerList() external view returns (address[] memory) {
        return _owners;
    }

    function guardianList() external view returns (address[] memory) {
        return _guardians;
    }

    /// @notice Execute a single call or atomic batch. nonce is the full EntryPoint keyed nonce.
    /// @dev Permission must be rechecked after validation because earlier bundled ops can revoke it.
    function executeOperation(uint256 nonce, uint256 expectedEpoch, Action[] calldata actions) external {
        if (msg.sender != address(_entryPoint) || _executing) revert Unauthorized();
        bytes32 payload = keccak256(msg.data);
        Permit memory permit = _permits[payload];
        if (permit.epoch != epoch || expectedEpoch != epoch) revert StaleAuthorization();
        delete _permits[payload];
        _executing = true;
        if (permit.mode == 1) _spendSession(permit.signer, actions);
        for (uint256 i; i < actions.length; ++i) {
            (bool ok, bytes memory result) = actions[i].target.call{value: actions[i].value}(actions[i].data);
            if (!ok) revert CallFailed(i, result);
        }
        _executing = false;
        emit Executed(nonce, payload);
    }

    // BaseAccount's inherited entrypoint-only execute/executeBatch must not bypass scoped authorization.
    function execute(address, uint256, bytes calldata) external pure override {
        revert Unauthorized();
    }

    function executeBatch(Call[] calldata) external pure override {
        revert Unauthorized();
    }

    function decodeOperation(bytes calldata callData)
        external
        pure
        returns (uint256 nonce, uint256 policyEpoch, Action[] memory actions)
    {
        if (callData.length < 4 || bytes4(callData[:4]) != SmartAccount.executeOperation.selector) {
            revert InvalidPolicy();
        }
        return abi.decode(callData[4:], (uint256, uint256, Action[]));
    }

    function _validateSignature(PackedUserOperation calldata op, bytes32 opHash) internal override returns (uint256) {
        uint256 n;
        uint256 e;
        Action[] memory actions;
        try this.decodeOperation(op.callData) returns (uint256 a, uint256 b, Action[] memory c) {
            n = a;
            e = b;
            actions = c;
        } catch {
            return 1;
        }
        if (n != op.nonce || e != epoch || actions.length == 0 || actions.length > 16 || op.signature.length < 1) {
            return 1;
        }
        uint8 mode = uint8(op.signature[0]);
        bytes calldata signature = op.signature[1:];
        address signer;
        uint256 validationData;
        if (mode == 0) {
            if (!_thresholdValid(opHash, signature)) return 1;
        } else if (mode == 1) {
            (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(opHash, signature);
            if (err != ECDSA.RecoverError.NoError || recovered == address(0)) return 1;
            signer = recovered;
            Session memory s = sessions[signer];
            if (s.epoch != epoch || s.validUntil == 0 || !_sessionAllowed(s, actions)) return 1;
            // EntryPoint evaluates the time range; do not use block.timestamp during validation.
            validationData = uint256(s.validUntil) << 160;
        } else if (mode == 2) {
            try this.verifyPasskey(opHash, signature) returns (bool ok) {
                if (!ok) return 1;
            } catch {
                return 1;
            }
        } else {
            return 1;
        }
        _permits[keccak256(op.callData)] = Permit(epoch, signer, mode);
        return validationData;
    }

    function _thresholdValid(bytes32 digest, bytes calldata signatures) internal view returns (bool) {
        if (signatures.length != threshold * 65) return false;
        address previous;
        for (uint256 i; i < threshold; ++i) {
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signatures[i * 65:(i + 1) * 65]);
            if (err != ECDSA.RecoverError.NoError || signer <= previous || !owners[signer]) return false;
            previous = signer;
        }
        return true;
    }

    /// @notice ERC-1271 signs a wallet-specific message domain, not the raw consumer digest.
    function messageDigest(bytes32 hash) public view returns (bytes32) {
        return keccak256(abi.encode("W05:ERC1271:v1", block.chainid, address(this), address(_entryPoint), epoch, hash));
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _thresholdValid(messageDigest(hash), signature) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function _sessionAllowed(Session memory s, Action[] memory actions) private view returns (bool) {
        uint256 total;
        for (uint256 i; i < actions.length; ++i) {
            Action memory a = actions[i];
            if (
                a.target != s.target || a.target == address(this) || a.target == address(_entryPoint)
                    || a.data.length < 4
            ) return false;
            bytes memory data = a.data;
            bytes4 selector;
            assembly ("memory-safe") { selector := mload(add(data, 32)) }
            if (selector != s.selector || a.value > s.remaining - total) return false;
            total += a.value;
        }
        return true;
    }

    function _spendSession(address key, Action[] calldata actions) private {
        Session storage s = sessions[key];
        if (s.epoch != epoch || block.timestamp > s.validUntil || !_sessionAllowed(s, actions)) revert SessionDenied();
        uint256 total;
        for (uint256 i; i < actions.length; ++i) {
            total += actions[i].value;
        }
        s.remaining -= total; // Effects precede any external call; batch revert restores the budget.
    }

    function setSession(address key, address target, bytes4 selector, uint48 validUntil, uint256 budget)
        external
        onlySelf
    {
        if (
            key == address(0) || target == address(this) || target == address(_entryPoint) || target.code.length == 0
                || validUntil <= block.timestamp
        ) revert InvalidPolicy();
        _bumpEpoch();
        sessions[key] = Session(target, selector, validUntil, budget, epoch);
        emit SessionConfigured(key, target, selector, validUntil, budget);
    }

    function revokeSession(address key) external onlySelf {
        delete sessions[key];
        _bumpEpoch();
        emit SessionRevoked(key);
    }

    function setOwners(address[] calldata list, uint256 required) external onlySelf {
        _validateList(list, required);
        for (uint256 i; i < _owners.length; ++i) {
            delete owners[_owners[i]];
        }
        delete _owners;
        for (uint256 i; i < list.length; ++i) {
            owners[list[i]] = true;
            _owners.push(list[i]);
        }
        threshold = required;
        emit OwnersConfigured(list, required);
        _bumpEpoch();
        _clearRecovery();
    }

    function setGuardians(address[] calldata list, uint256 required) external onlySelf {
        _validateList(list, required);
        for (uint256 i; i < _guardians.length; ++i) {
            delete guardians[_guardians[i]];
        }
        delete _guardians;
        for (uint256 i; i < list.length; ++i) {
            guardians[list[i]] = true;
            _guardians.push(list[i]);
        }
        guardianThreshold = required;
        emit GuardiansConfigured(list, required);
        _bumpEpoch();
        _clearRecovery();
    }

    function _validateList(address[] calldata list, uint256 required) private pure {
        if (required == 0 || required > list.length || list.length > 10) revert InvalidPolicy();
        address previous;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] <= previous) revert InvalidPolicy();
            previous = list[i];
        }
    }

    function setPasskey(bytes32 x, bytes32 y, bytes32 rp, string calldata origin) external onlySelf {
        if (threshold != 1 || x == 0 || y == 0 || rp == 0 || bytes(origin).length == 0 || bytes(origin).length > 200) {
            revert InvalidPolicy();
        }
        _bumpEpoch();
        passkeyX = x;
        passkeyY = y;
        rpIdHash = rp;
        passkeyOrigin = origin;
        passkeyEpoch = epoch;
        emit PasskeyConfigured(x, y, rp, origin);
    }

    function revokePasskey() external onlySelf {
        _bumpEpoch();
        emit PasskeyRevoked(epoch);
    }

    /// @dev W3C WebAuthn 3 section 5.8.1.2 limited verification (topOrigin undefined).
    /// Canonical context prefix is mandatory; signed extension fields may follow.
    /// The signed suffix is opaque, not parsed or used as authorization data. RP hash is checked separately.
    /// Registration is authenticated by an existing owner operation, not an unauthenticated key upload.
    function verifyPasskey(bytes32 hash, bytes calldata signature) external view returns (bool) {
        if (passkeyEpoch != epoch || threshold != 1) return false;
        WebAuthn.WebAuthnAuth memory auth = abi.decode(signature, (WebAuthn.WebAuthnAuth));
        if (auth.authenticatorData.length < 37 || bytes32(auth.authenticatorData) != rpIdHash) return false;
        string memory expected = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64.encodeURL(abi.encodePacked(hash)),
            '","origin":"',
            passkeyOrigin,
            '","crossOrigin":false'
        );
        bytes memory json = bytes(auth.clientDataJSON);
        bytes memory prefix = bytes(expected);
        if (json.length <= prefix.length) return false;
        for (uint256 i; i < prefix.length; ++i) {
            if (json[i] != prefix[i]) return false;
        }
        // W3C steps 13-15: require the full prefix and an object/field delimiter.
        if (json[prefix.length] != bytes1("}") && json[prefix.length] != bytes1(",")) return false;
        return WebAuthn.verify(abi.encodePacked(hash), auth, passkeyX, passkeyY, true);
    }

    function _bumpEpoch() private {
        ++epoch;
        emit PolicyChanged(epoch);
    }

    /// @notice Create an independent recovery proposal. One guardian cannot lock a global proposal slot.
    function proposeRecovery(address replacement) external returns (bytes32 id) {
        if (!guardians[msg.sender] || replacement == address(0)) revert Unauthorized();
        id = keccak256(abi.encode(address(this), block.chainid, ++recoverySequence, epoch, replacement));
        uint48 readyAt = uint48(block.timestamp) + RECOVERY_DELAY;
        recoveryProposals[id] = Recovery(replacement, readyAt, 0, epoch, true);
        // These fields expose the most recent proposal for simple clients; ID-based methods remain authoritative.
        recoveryId = id;
        recoveryOwner = replacement;
        recoveryReadyAt = readyAt;
        recoveryVotes = 0;
        emit RecoveryProposed(id, replacement, readyAt);
        _approveRecovery(id);
    }

    function approveRecovery() external {
        _approveRecovery(recoveryId);
    }

    function approveRecovery(bytes32 id) external {
        _approveRecovery(id);
    }

    function _approveRecovery(bytes32 id) private {
        Recovery storage proposal = recoveryProposals[id];
        if (!guardians[msg.sender] || !proposal.active || proposal.policyEpoch != epoch || _voted[id][msg.sender]) {
            revert Unauthorized();
        }
        _voted[id][msg.sender] = true;
        ++proposal.votes;
        if (id == recoveryId) recoveryVotes = proposal.votes;
        emit RecoveryApproved(id, msg.sender);
    }

    /// @notice Cancel every pending proposal and invalidate queued authorization through the policy epoch.
    function cancelRecovery() external onlySelf {
        _bumpEpoch();
        _clearRecovery();
    }

    function cancelRecovery(bytes32 id) external onlySelf {
        recoveryProposals[id].active = false;
        if (id == recoveryId) _clearRecovery();
    }

    function completeRecovery() external {
        _completeRecovery(recoveryId);
    }

    function completeRecovery(bytes32 id) external {
        _completeRecovery(id);
    }

    function _completeRecovery(bytes32 id) private {
        Recovery storage proposal = recoveryProposals[id];
        if (
            _executing || !proposal.active || proposal.policyEpoch != epoch || proposal.votes < guardianThreshold
                || block.timestamp < proposal.readyAt
        ) revert RecoveryNotReady();
        address replacement = proposal.owner;
        proposal.active = false;
        for (uint256 i; i < _owners.length; ++i) {
            delete owners[_owners[i]];
        }
        delete _owners;
        _owners.push(replacement);
        owners[replacement] = true;
        threshold = 1;
        _bumpEpoch();
        _clearRecovery();
        emit RecoveryCompleted(replacement, epoch);
    }

    function _clearRecovery() private {
        recoveryId = 0;
        recoveryOwner = address(0);
        recoveryReadyAt = 0;
        recoveryVotes = 0;
    }
}
