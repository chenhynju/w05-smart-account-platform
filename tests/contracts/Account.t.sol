// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {SmartAccount} from "../../contracts/SmartAccount.sol";
import {AccountFactory} from "../../contracts/AccountFactory.sol";
import {QuotaPaymaster} from "../../contracts/QuotaPaymaster.sol";
import {Counter} from "../../contracts/Counter.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

interface Vm {
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function deal(address, uint256) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function signP256(uint256, bytes32) external pure returns (bytes32, bytes32);
    function publicKeyP256(uint256) external pure returns (uint256, uint256);
}

contract CallbackTarget {
    SmartAccount public immutable account;
    bool public entered;

    constructor(SmartAccount a) {
        account = a;
    }

    function attack(bytes calldata payload) external payable {
        (bool ok,) = address(account).call(payload);
        entered = ok;
    }
}

contract AccountTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    EntryPoint ep;
    AccountFactory factory;
    SmartAccount account;
    QuotaPaymaster pm;
    Counter counter;
    uint256 constant OWNER = 0xa11ce;
    uint256 constant SESSION = 0xb0b;
    uint256 constant SPONSOR = 0xcafe;
    address guardian;
    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 1000 ether);
        vm.warp(1000);
        ep = new EntryPoint();
        factory = new AccountFactory(ep);
        guardian = vm.addr(0xdad);
        account = factory.createAccount(vm.addr(OWNER), guardian, bytes32(0));
        counter = new Counter();
        pm = new QuotaPaymaster(ep, vm.addr(SPONSOR));
        vm.deal(address(account), 100 ether);
        ep.depositTo{value: 10 ether}(address(account));
        pm.deposit{value: 10 ether}();
        pm.setQuota(address(account), 5 ether);
    }

    function sig(uint256 key, bytes32 hash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
        return abi.encodePacked(r, s, v);
    }

    function actions(address target, uint256 value, bytes memory data)
        internal
        pure
        returns (SmartAccount.Action[] memory a)
    {
        a = new SmartAccount.Action[](1);
        a[0] = SmartAccount.Action(target, value, data);
    }

    function operation(SmartAccount.Action[] memory calls) internal view returns (PackedUserOperation memory op) {
        op.sender = address(account);
        op.nonce = ep.getNonce(address(account), 0);
        op.callData = abi.encodeCall(SmartAccount.executeOperation, (op.nonce, account.epoch(), calls));
        op.accountGasLimits = bytes32(uint256(3000000) << 128 | uint256(1500000));
        op.preVerificationGas = 100000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(2 gwei));
    }

    function signed(PackedUserOperation memory op, uint256 key, uint8 mode)
        internal
        view
        returns (PackedUserOperation memory)
    {
        op.signature = abi.encodePacked(mode, sig(key, ep.getUserOpHash(op)));
        return op;
    }

    function send(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        ep.handleOps(ops, payable(address(this)));
    }

    function admin(bytes memory data) internal {
        send(signed(operation(actions(address(account), 0, data)), OWNER, 0));
    }

    function addSession(uint256 budget) internal {
        admin(
            abi.encodeCall(
                SmartAccount.setSession,
                (vm.addr(SESSION), address(counter), Counter.increment.selector, uint48(block.timestamp + 100), budget)
            )
        );
    }

    function sponsor(PackedUserOperation memory op) internal view returns (PackedUserOperation memory) {
        bytes memory prefix = abi.encodePacked(address(pm), uint128(500000), uint128(0));
        op.paymasterAndData = prefix;
        uint48 until = uint48(block.timestamp + 100);
        uint256 e = pm.quotaEpoch();
        bytes memory authorization = sig(SPONSOR, pm.sponsorshipDigest(op, until, 0, e));
        op.paymasterAndData = bytes.concat(prefix, abi.encode(until, uint48(0), e, authorization));
        return signed(op, OWNER, 0);
    }

    function testFactoryIdempotentAndSeparated() public {
        require(address(factory.createAccount(vm.addr(OWNER), guardian, 0)) == address(account));
        require(factory.getAddress(vm.addr(OWNER), guardian, bytes32(uint256(1))) != address(account));
    }

    function testOwnerExecutionAndNonceReplay() public {
        PackedUserOperation memory op =
            signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (3)))), OWNER, 0);
        send(op);
        require(counter.number() == 3);
        require(ep.getNonce(address(account), 0) == 1);
        vm.expectRevert();
        send(op);
    }

    function testWrongSignerAndMalformedSignature() public {
        PackedUserOperation memory op =
            signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (3)))), SESSION, 0);
        vm.expectRevert();
        send(op);
        op.signature = hex"00dead";
        vm.expectRevert();
        send(op);
    }

    function testDirectAndInheritedBypassDenied() public {
        vm.prank(vm.addr(OWNER));
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.executeOperation(0, 1, actions(address(counter), 0, abi.encodeCall(Counter.increment, (3))));
        vm.prank(address(ep));
        vm.expectRevert();
        account.execute(address(counter), 0, abi.encodeCall(Counter.increment, (3)));
    }

    function testAtomicBatchRollbackAndGasNonceStillConsumed() public {
        SmartAccount.Action[] memory a = new SmartAccount.Action[](2);
        a[0] = SmartAccount.Action(address(counter), 0, abi.encodeCall(Counter.increment, (7)));
        a[1] = SmartAccount.Action(address(counter), 0, abi.encodeCall(Counter.fail, ()));
        send(signed(operation(a), OWNER, 0));
        require(counter.number() == 0);
        require(ep.getNonce(address(account), 0) == 1);
    }

    function testCrossChainSignatureRejected() public {
        PackedUserOperation memory op =
            signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))), OWNER, 0);
        vm.chainId(999);
        vm.expectRevert();
        send(op);
    }

    function testERC1271DomainAndMalformed() public {
        bytes32 h = keccak256("message");
        bytes memory s = sig(OWNER, account.messageDigest(h));
        require(account.isValidSignature(h, s) == 0x1626ba7e);
        require(account.isValidSignature(h, hex"00") == 0xffffffff);
        SmartAccount other = factory.createAccount(vm.addr(OWNER), guardian, bytes32(uint256(1)));
        require(other.isValidSignature(h, s) == 0xffffffff);
        vm.chainId(999);
        require(account.isValidSignature(h, s) == 0xffffffff);
    }

    function testSessionBudgetExpiryAndRevocation() public {
        addSession(2 ether);
        send(signed(operation(actions(address(counter), 1 ether, abi.encodeCall(Counter.increment, (1)))), SESSION, 1));
        require(counter.number() == 1);
        PackedUserOperation memory op =
            signed(operation(actions(address(counter), 2 ether, abi.encodeCall(Counter.increment, (1)))), SESSION, 1);
        vm.expectRevert();
        send(op);
        op = signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))), SESSION, 1);
        vm.warp(block.timestamp + 101);
        vm.expectRevert();
        send(op);
        admin(abi.encodeCall(SmartAccount.revokeSession, (vm.addr(SESSION))));
        op = signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))), SESSION, 1);
        vm.expectRevert();
        send(op);
    }

    function testSessionCannotAdminOrWrongSelector() public {
        addSession(1 ether);
        PackedUserOperation memory op = signed(
            operation(actions(address(account), 0, abi.encodeCall(SmartAccount.revokeSession, (vm.addr(SESSION))))),
            SESSION,
            1
        );
        vm.expectRevert();
        send(op);
        op = signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.fail, ()))), SESSION, 1);
        vm.expectRevert();
        send(op);
    }

    function testRevocationBetweenValidationAndExecution() public {
        addSession(1 ether);
        uint256 n = ep.getNonce(address(account), 0);
        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = signed(
            operation(actions(address(account), 0, abi.encodeCall(SmartAccount.revokeSession, (vm.addr(SESSION))))),
            OWNER,
            0
        );
        ops[1] = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (100))));
        ops[1].nonce = n + 1;
        ops[1].callData = abi.encodeCall(
            SmartAccount.executeOperation,
            (n + 1, account.epoch(), actions(address(counter), 0, abi.encodeCall(Counter.increment, (100))))
        );
        ops[1] = signed(ops[1], SESSION, 1);
        ep.handleOps(ops, payable(address(this)));
        require(counter.number() == 0);
    }

    function testMultisigSortedUniqueThreshold() public {
        address a = vm.addr(OWNER);
        address b = vm.addr(SESSION);
        address[] memory list = new address[](2);
        list[0] = a < b ? a : b;
        list[1] = a < b ? b : a;
        admin(abi.encodeCall(SmartAccount.setOwners, (list, 2)));
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (2))));
        bytes32 h = ep.getUserOpHash(op);
        op.signature = abi.encodePacked(uint8(0), sig(OWNER, h), sig(OWNER, h));
        vm.expectRevert();
        send(op);
        op.signature = abi.encodePacked(uint8(0), sig(a < b ? OWNER : SESSION, h), sig(a < b ? SESSION : OWNER, h));
        send(op);
        require(counter.number() == 2);
    }

    function testRecoveryDelayDuplicateVoteCancelAndEpoch() public {
        uint256 old = account.epoch();
        vm.prank(guardian);
        account.proposeRecovery(vm.addr(SESSION));
        vm.prank(guardian);
        vm.expectRevert();
        account.approveRecovery();
        vm.expectRevert(SmartAccount.RecoveryNotReady.selector);
        account.completeRecovery();
        admin(abi.encodeWithSignature("cancelRecovery()"));
        require(account.recoveryId() == 0);
        vm.prank(guardian);
        account.proposeRecovery(vm.addr(SESSION));
        vm.warp(block.timestamp + 2 days);
        account.completeRecovery();
        require(account.owners(vm.addr(SESSION)));
        require(!account.owners(vm.addr(OWNER)));
        require(account.epoch() > old);
        PackedUserOperation memory op =
            signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))), OWNER, 0);
        vm.expectRevert();
        send(op);
    }

    function testSponsorshipReservesQuotaOnRevertingExecution() public {
        uint256 before_ = pm.remaining(address(account));
        send(sponsor(operation(actions(address(counter), 0, abi.encodeCall(Counter.fail, ())))));
        require(pm.remaining(address(account)) < before_);
        require(ep.getNonce(address(account), 0) == 1);
    }

    function testSponsorQuotaAndTamperRejected() public {
        PackedUserOperation memory op =
            sponsor(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))));
        op.preVerificationGas += 1;
        op = signed(op, OWNER, 0);
        vm.expectRevert();
        send(op);
        pm.setQuota(address(account), 1);
        op = sponsor(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))));
        vm.expectRevert();
        send(op);
    }

    function passkeyAssertion(bytes32 h, bytes1 flags, string memory origin) internal pure returns (bytes memory) {
        string memory json = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64.encodeURL(abi.encodePacked(h)),
            '","origin":"',
            origin,
            '","crossOrigin":false}'
        );
        bytes memory data = abi.encodePacked(sha256("localhost"), flags, bytes4(0));
        (bytes32 r, bytes32 s) = vm.signP256(42, sha256(abi.encodePacked(data, sha256(bytes(json)))));
        WebAuthn.WebAuthnAuth memory auth = WebAuthn.WebAuthnAuth(r, s, 23, 1, data, json);
        return abi.encode(auth);
    }

    // Public Chromium assertion captured before the fix; no private key is in this fixture.
    function testPasskeyCapturedChromiumExtension() public {
        admin(
            abi.encodeCall(
                SmartAccount.setPasskey,
                (
                    bytes32(0x4ecdc5689846f7c3ad0ebc72ab92a9ca8f54a20a5d51ddec1120e206c43bb020),
                    bytes32(0x3ff4796b5f9be36e509abbcd78dd4137175016c5e922b3fe4a4814978eda2275),
                    sha256("localhost"),
                    "http://localhost:3155"
                )
            )
        );
        require(
            account.verifyPasskey(
                0xbb98236b7d11da14762f1e99224ca7946ccc10ea9181b3a4634aafcad383927c,
                hex"000000000000000000000000000000000000000000000000000000000000002069f9822e43bda0db677e8ceaa4b82298868c00b3a5f4c1589482dd07e2dd34c86281a7b87c20467def2c2d6b8299d05697d5c37e9313bd8373e148b458bce3840000000000000000000000000000000000000000000000000000000000000017000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000002549960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763050000000300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f37b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a227535676a61333052326852324c78365a496b796e6c477a4d454f715267624f6b5930717679744f446b6e77222c226f726967696e223a22687474703a2f2f6c6f63616c686f73743a33313535222c2263726f73734f726967696e223a66616c73652c226f746865725f6b6579735f63616e5f62655f61646465645f68657265223a22646f206e6f7420636f6d7061726520636c69656e74446174614a534f4e20616761696e737420612074656d706c6174652e205365652068747470733a2f2f676f6f2e676c2f796162506578227d00000000000000000000000000"
            ),
            "valid browser extension rejected"
        );
    }

    function signClientData(string memory json) internal pure returns (bytes memory) {
        bytes memory data = abi.encodePacked(sha256("localhost"), bytes1(0x05), bytes4(0));
        (bytes32 r, bytes32 s) = vm.signP256(42, sha256(abi.encodePacked(data, sha256(bytes(json)))));
        return abi.encode(WebAuthn.WebAuthnAuth(r, s, 23, 1, data, json));
    }

    function testPasskeyExtensionAndPrefixBoundaries() public {
        (uint256 x, uint256 y) = vm.publicKeyP256(42);
        admin(
            abi.encodeCall(
                SmartAccount.setPasskey, (bytes32(x), bytes32(y), sha256("localhost"), "http://localhost:3155")
            )
        );
        bytes32 h = keccak256("limited-verification");
        string memory prefix = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64.encodeURL(abi.encodePacked(h)),
            '","origin":"http://localhost:3155","crossOrigin":false'
        );
        require(account.verifyPasskey(h, signClientData(string.concat(prefix, "}"))));
        require(
            account.verifyPasskey(h, signClientData(string.concat(prefix, ',"extension":{"nested":true}}'))),
            "extension rejected"
        );
        require(!account.verifyPasskey(h, signClientData(prefix)), "missing delimiter");
        require(!account.verifyPasskey(h, signClientData(string.concat(prefix, "hood}"))), "false token boundary");
        require(!account.verifyPasskey(h, signClientData(string.concat(prefix, " }"))), "noncanonical delimiter");
        require(
            !account.verifyPasskey(bytes32(uint256(1)), signClientData(string.concat(prefix, ',"extension":1}'))),
            "challenge mismatch"
        );
        string memory evil = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64.encodeURL(abi.encodePacked(h)),
            '","origin":"http://evil.test","crossOrigin":false,"origin":"http://localhost:3155"}'
        );
        require(!account.verifyPasskey(h, signClientData(evil)), "later origin must not override prefix");
    }

    function testPasskeyValidWrongOriginNoUVWrongChallengeAndRevocation() public {
        (uint256 x, uint256 y) = vm.publicKeyP256(42);
        admin(
            abi.encodeCall(
                SmartAccount.setPasskey, (bytes32(x), bytes32(y), sha256("localhost"), "http://localhost:3155")
            )
        );
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        bytes32 h = ep.getUserOpHash(op);
        // Same length as localhost: a prefix-content check cannot hide behind a length check.
        op.signature = abi.encodePacked(uint8(2), passkeyAssertion(h, 0x05, "http://evilhostx:3155"));
        vm.expectRevert();
        send(op);
        // Wrong RP with a mathematically valid P256 signature, rather than an invalid-signature surrogate.
        WebAuthn.WebAuthnAuth memory wrongRP =
            abi.decode(passkeyAssertion(h, 0x05, "http://localhost:3155"), (WebAuthn.WebAuthnAuth));
        wrongRP.authenticatorData = abi.encodePacked(sha256("evilhostx"), bytes1(0x05), bytes4(0));
        (wrongRP.r, wrongRP.s) =
            vm.signP256(42, sha256(abi.encodePacked(wrongRP.authenticatorData, sha256(bytes(wrongRP.clientDataJSON)))));
        require(!account.verifyPasskey(h, abi.encode(wrongRP)), "wrong RP accepted despite valid signature");
        op.signature = abi.encodePacked(uint8(2), passkeyAssertion(h, 0x05, "http://evil.test"));
        vm.expectRevert();
        send(op);
        op.signature = abi.encodePacked(uint8(2), passkeyAssertion(h, 0x01, "http://localhost:3155"));
        vm.expectRevert();
        send(op);
        op.signature = abi.encodePacked(uint8(2), passkeyAssertion(bytes32(uint256(1)), 0x05, "http://localhost:3155"));
        vm.expectRevert();
        send(op);
        op.signature = abi.encodePacked(uint8(2), passkeyAssertion(h, 0x05, "http://localhost:3155"));
        send(op);
        require(counter.number() == 1);
        admin(abi.encodeCall(SmartAccount.revokePasskey, ()));
        require(!account.verifyPasskey(h, passkeyAssertion(h, 0x05, "http://localhost:3155")));
    }

    function testFuzz_OwnerAmount(uint96 amount) public {
        send(
            signed(
                operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (uint256(amount))))), OWNER, 0
            )
        );
        require(counter.number() == amount);
    }

    function testFuzz_AtomicRollback(uint96 amount) public {
        SmartAccount.Action[] memory a = new SmartAccount.Action[](2);
        a[0] = SmartAccount.Action(address(counter), 0, abi.encodeCall(Counter.increment, (uint256(amount))));
        a[1] = SmartAccount.Action(address(counter), 0, abi.encodeCall(Counter.fail, ()));
        send(signed(operation(a), OWNER, 0));
        require(counter.number() == 0);
    }

    function testGuardianCannotLockRecoverySlot() public {
        address[] memory list = new address[](3);
        list[0] = vm.addr(21);
        list[1] = vm.addr(22);
        list[2] = vm.addr(23);
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                if (list[i] > list[j]) (list[i], list[j]) = (list[j], list[i]);
            }
        }
        admin(abi.encodeCall(SmartAccount.setGuardians, (list, 2)));
        vm.prank(list[0]);
        account.proposeRecovery(vm.addr(999));
        // A single uncooperative guardian must not prevent the other threshold from recovering.
        vm.prank(list[1]);
        account.proposeRecovery(vm.addr(888));
        require(account.recoveryOwner() == vm.addr(888));
        bytes32 good = account.recoveryId();
        vm.prank(list[2]);
        account.approveRecovery(good);
        vm.prank(list[0]);
        account.proposeRecovery(vm.addr(777));
        vm.warp(block.timestamp + 2 days);
        account.completeRecovery(good);
        require(account.owners(vm.addr(888)));
    }

    function testSessionReconfigurationInvalidatesQueuedOperation() public {
        addSession(1 ether);
        PackedUserOperation memory old =
            signed(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (9)))), SESSION, 1);
        addSession(2 ether);
        vm.expectRevert();
        send(old);
        require(counter.number() == 0);
    }

    function testTwoSessionOpsCannotOverspendOneBudget() public {
        addSession(1 ether);
        uint256 n = ep.getNonce(address(account), 0);
        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] =
            signed(operation(actions(address(counter), 0.7 ether, abi.encodeCall(Counter.increment, (1)))), SESSION, 1);
        ops[1] = operation(actions(address(counter), 0.7 ether, abi.encodeCall(Counter.increment, (10))));
        ops[1].nonce = n + 1;
        ops[1].callData = abi.encodeCall(
            SmartAccount.executeOperation,
            (n + 1, account.epoch(), actions(address(counter), 0.7 ether, abi.encodeCall(Counter.increment, (10))))
        );
        ops[1] = signed(ops[1], SESSION, 1);
        ep.handleOps(ops, payable(address(this)));
        require(counter.number() == 1);
        (,,, uint256 budget,) = account.sessions(vm.addr(SESSION));
        require(budget == 0.3 ether);
    }

    function testInvalidSelectorsNonceAndEmptyBatch() public {
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.callData = hex"deadbeef";
        op = signed(op, OWNER, 0);
        vm.expectRevert();
        send(op);
        op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.callData = abi.encodeCall(
            SmartAccount.executeOperation,
            (op.nonce + 1, account.epoch(), actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))))
        );
        op = signed(op, OWNER, 0);
        vm.expectRevert();
        send(op);
        SmartAccount.Action[] memory empty = new SmartAccount.Action[](0);
        op = signed(operation(empty), OWNER, 0);
        vm.expectRevert();
        send(op);
    }

    function testInvalidOwnerGuardianListsAndUnauthorizedAdmin() public {
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.revokePasskey();
        address[] memory bad = new address[](2);
        bad[0] = guardian;
        bad[1] = guardian;
        uint256 before_ = account.epoch();
        admin(abi.encodeCall(SmartAccount.setOwners, (bad, 2)));
        require(account.epoch() == before_);
        bad[0] = address(0);
        admin(abi.encodeCall(SmartAccount.setGuardians, (bad, 1)));
        require(account.epoch() == before_);
        vm.expectRevert();
        new SmartAccount(ep, address(0), guardian);
    }

    function testExpiredRotatedSponsorAndUnauthorizedPaymaster() public {
        PackedUserOperation memory op =
            sponsor(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))));
        vm.warp(block.timestamp + 301);
        vm.expectRevert();
        send(op);
        op = sponsor(operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1)))));
        pm.setSponsor(vm.addr(OWNER));
        vm.expectRevert();
        send(op);
        vm.prank(guardian);
        vm.expectRevert();
        pm.setQuota(address(account), 100 ether);
        vm.expectRevert();
        pm.validatePaymasterUserOp(op, 0, 1);
    }

    function testRecoveryWrongGuardianAndStalePolicy() public {
        vm.prank(vm.addr(SESSION));
        vm.expectRevert();
        account.proposeRecovery(vm.addr(SESSION));
        vm.prank(guardian);
        bytes32 id = account.proposeRecovery(vm.addr(SESSION));
        address[] memory list = new address[](1);
        list[0] = guardian;
        admin(abi.encodeCall(SmartAccount.setGuardians, (list, 1)));
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert();
        account.completeRecovery(id);
    }

    function testFuzzSessionBudget(uint64 value) public {
        uint256 budget = uint256(value) + 1;
        addSession(budget);
        send(signed(operation(actions(address(counter), budget, abi.encodeCall(Counter.increment, (1)))), SESSION, 1));
        (,,, uint256 remaining,) = account.sessions(vm.addr(SESSION));
        require(remaining == 0);
        PackedUserOperation memory op =
            signed(operation(actions(address(counter), 1, abi.encodeCall(Counter.increment, (1)))), SESSION, 1);
        vm.expectRevert();
        send(op);
    }

    function testCallbackCannotReenterExecutionOrFinalizeRecovery() public {
        CallbackTarget target = new CallbackTarget(account);
        bytes memory payload = abi.encodeCall(
            SmartAccount.executeOperation,
            (uint256(0), account.epoch(), actions(address(counter), 0, abi.encodeCall(Counter.increment, (100))))
        );
        send(signed(operation(actions(address(target), 0, abi.encodeCall(CallbackTarget.attack, (payload)))), OWNER, 0));
        require(!target.entered());
        require(counter.number() == 0);
        address[] memory list = new address[](1);
        list[0] = address(target);
        admin(abi.encodeCall(SmartAccount.setGuardians, (list, 1)));
        vm.prank(address(target));
        account.proposeRecovery(vm.addr(SESSION));
        vm.warp(block.timestamp + 2 days);
        send(
            signed(
                operation(
                    actions(
                        address(target),
                        0,
                        abi.encodeCall(CallbackTarget.attack, (abi.encodeWithSignature("completeRecovery()")))
                    )
                ),
                OWNER,
                0
            )
        );
        require(!target.entered());
        require(account.owners(vm.addr(OWNER)));
        account.completeRecovery();
        require(account.owners(vm.addr(SESSION)));
    }

    function testListsReceiveAndDisabledBatch() public {
        require(account.ownerList().length == 1);
        require(account.guardianList().length == 1);
        (bool ok,) = address(account).call{value: 1 ether}("");
        require(ok);
        BaseAccount.Call[] memory a = new BaseAccount.Call[](0);
        vm.prank(address(ep));
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.executeBatch(a);
    }

    function testCancelSpecificProposalDoesNotCancelIndependentThreshold() public {
        vm.prank(guardian);
        bytes32 first = account.proposeRecovery(vm.addr(SESSION));
        vm.prank(guardian);
        bytes32 second = account.proposeRecovery(vm.addr(42));
        admin(abi.encodeWithSignature("cancelRecovery(bytes32)", first));
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert();
        account.completeRecovery(first);
        account.completeRecovery(second);
        require(account.owners(vm.addr(42)));
    }

    function testMalformedPasskeyAndUnknownSignatureMode() public {
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.signature = hex"03";
        vm.expectRevert();
        send(op);
        (uint256 x, uint256 y) = vm.publicKeyP256(42);
        admin(
            abi.encodeCall(
                SmartAccount.setPasskey, (bytes32(x), bytes32(y), sha256("localhost"), "http://localhost:3155")
            )
        );
        op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.signature = hex"02dead";
        vm.expectRevert();
        send(op);
        uint256 before_ = account.epoch();
        admin(
            abi.encodeCall(
                SmartAccount.setPasskey, (bytes32(0), bytes32(y), sha256("localhost"), "http://localhost:3155")
            )
        );
        require(account.epoch() == before_);
        admin(
            abi.encodeCall(
                SmartAccount.setSession,
                (vm.addr(SESSION), address(account), bytes4(0), uint48(block.timestamp + 100), uint256(1))
            )
        );
        require(account.epoch() == before_);
    }

    function testPaymasterConstructorAndZeroSponsorGuards() public {
        vm.expectRevert();
        new QuotaPaymaster(ep, address(0));
        vm.expectRevert();
        pm.setSponsor(address(0));
    }

    function testCounterfactualFactoryDeploymentViaEntryPoint() public {
        bytes32 salt = bytes32(uint256(4337));
        address predicted = factory.getAddress(vm.addr(OWNER), guardian, salt);
        require(predicted.code.length == 0);
        ep.depositTo{value: 1 ether}(predicted);
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (5))));
        op.sender = predicted;
        op.nonce = 0;
        op.initCode = abi.encodePacked(
            address(factory), abi.encodeCall(AccountFactory.createAccount, (vm.addr(OWNER), guardian, salt))
        );
        op.callData = abi.encodeCall(
            SmartAccount.executeOperation,
            (uint256(0), uint256(1), actions(address(counter), 0, abi.encodeCall(Counter.increment, (5))))
        );
        // This semantic deployment test also runs under unoptimized coverage instrumentation; gas cost is measured separately.
        op.accountGasLimits = bytes32(uint256(20000000) << 128 | uint256(1500000));
        send(signed(op, OWNER, 0));
        require(predicted.code.length > 0);
        require(counter.number() == 5);
        require(ep.getNonce(predicted, 0) == 1);
    }

    function testIndependentNonceKeysAndReplayIsolation() public {
        uint192 key = 42;
        uint256 n = ep.getNonce(address(account), key);
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.nonce = n;
        op.callData = abi.encodeCall(
            SmartAccount.executeOperation,
            (n, account.epoch(), actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))))
        );
        op = signed(op, OWNER, 0);
        send(op);
        require(ep.getNonce(address(account), 0) == 0);
        require(ep.getNonce(address(account), key) == n + 1);
        vm.expectRevert();
        send(op);
    }

    function testEveryPolicySetterRejectsDirectExternalCallers() public {
        address[] memory list = new address[](1);
        list[0] = vm.addr(OWNER);
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.setOwners(list, 1);
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.setGuardians(list, 1);
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.setSession(
            vm.addr(SESSION), address(counter), Counter.increment.selector, uint48(block.timestamp + 1 days), 1 ether
        );
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.revokeSession(vm.addr(SESSION));
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.setPasskey(bytes32(uint256(1)), bytes32(uint256(2)), keccak256("rp"), "https://wallet.example");
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.revokePasskey();
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.cancelRecovery();
        vm.expectRevert(SmartAccount.Unauthorized.selector);
        account.cancelRecovery(bytes32(0));
    }

    function testMalformedSessionECDSAIsRejectedByEntryPoint() public {
        addSession(1 ether);
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.signature = abi.encodePacked(uint8(1), bytes("malformed"));
        vm.expectRevert();
        send(op);
        require(counter.number() == 0);
    }

    function testPolicyListRejectsZeroThresholdAndOversizedMembership() public {
        address[] memory list = new address[](1);
        list[0] = vm.addr(OWNER);
        vm.expectRevert(SmartAccount.InvalidPolicy.selector);
        vm.prank(address(account));
        account.setOwners(list, 0);
        vm.expectRevert(SmartAccount.InvalidPolicy.selector);
        vm.prank(address(account));
        account.setGuardians(list, 2);
        address[] memory oversized = new address[](11);
        vm.expectRevert(SmartAccount.InvalidPolicy.selector);
        vm.prank(address(account));
        account.setOwners(oversized, 1);
    }

    function testCancellingOneRecoveryDoesNotClearAnotherProposal() public {
        vm.prank(guardian);
        bytes32 first = account.proposeRecovery(vm.addr(51));
        vm.prank(guardian);
        bytes32 second = account.proposeRecovery(vm.addr(52));
        vm.prank(address(account));
        account.cancelRecovery(first);
        (,,,, bool active) = account.recoveryProposals(first);
        require(!active && account.recoveryId() == second);
        vm.prank(address(account));
        account.cancelRecovery(second);
        require(account.recoveryId() == bytes32(0));
    }

    function testSponsorCannotBeClearedOrConstructedWithZeroSigner() public {
        vm.expectRevert(QuotaPaymaster.InvalidSponsorship.selector);
        pm.setSponsor(address(0));
        vm.expectRevert(QuotaPaymaster.InvalidSponsorship.selector);
        new QuotaPaymaster(ep, address(0));
    }

    function testSponsorshipDigestRejectsTruncatedPaymasterHeader() public {
        PackedUserOperation memory op = operation(actions(address(counter), 0, abi.encodeCall(Counter.increment, (1))));
        op.paymasterAndData = hex"00";
        uint256 policyEpoch = pm.quotaEpoch();
        vm.expectRevert(QuotaPaymaster.InvalidSponsorship.selector);
        pm.sponsorshipDigest(op, 1, 0, policyEpoch);
    }
}
