// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Signed, per-account worst-case wei sponsorship budgets. Failed executions consume quota.
/// @dev Alternative/allowlisted mempool only until ERC-7562 compatibility is independently established.
contract QuotaPaymaster is BasePaymaster {
    address public sponsor;
    uint256 public quotaEpoch = 1;
    mapping(address => uint256) public remaining;
    error InvalidSponsorship();
    error QuotaExceeded();
    event QuotaConfigured(address indexed account, uint256 budget);
    event Reserved(address indexed account, uint256 maxCost, uint256 remaining);

    constructor(IEntryPoint ep, address signer) BasePaymaster(ep) {
        if (signer == address(0)) revert InvalidSponsorship();
        sponsor = signer;
    }

    function setQuota(address account, uint256 budget) external onlyOwner {
        remaining[account] = budget;
        // Rotate all outstanding sponsorships when policy changes; quotas themselves persist.
        ++quotaEpoch;
        emit QuotaConfigured(account, budget);
    }

    function setSponsor(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidSponsorship();
        sponsor = signer;
        ++quotaEpoch;
    }

    function sponsorshipDigest(PackedUserOperation calldata op, uint48 until, uint48 after_, uint256 policyEpoch)
        public
        view
        returns (bytes32)
    {
        if (op.paymasterAndData.length < 52) revert InvalidSponsorship();
        return keccak256(
            abi.encode(
                "W05:SPONSOR:v1",
                block.chainid,
                address(entryPoint),
                address(this),
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.accountGasLimits,
                op.preVerificationGas,
                op.gasFees,
                keccak256(op.paymasterAndData[:52]),
                until,
                after_,
                policyEpoch
            )
        );
    }

    function _validatePaymasterUserOp(PackedUserOperation calldata op, bytes32, uint256 maxCost)
        internal
        override
        returns (bytes memory, uint256)
    {
        (uint48 until, uint48 after_, uint256 policyEpoch, bytes memory signature) =
            abi.decode(op.paymasterAndData[52:], (uint48, uint48, uint256, bytes));
        (address signer, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(sponsorshipDigest(op, until, after_, policyEpoch), signature);
        if (
            err != ECDSA.RecoverError.NoError || signer != sponsor || policyEpoch != quotaEpoch || until == 0
                || until <= after_
        ) return ("", 1);
        if (maxCost > remaining[op.sender]) revert QuotaExceeded();
        remaining[op.sender] -= maxCost;
        emit Reserved(op.sender, maxCost, remaining[op.sender]);
        // Empty context avoids an unnecessary postOp call and its gas/DoS surface.
        return ("", uint256(until) << 160 | uint256(after_) << 208);
    }
}
