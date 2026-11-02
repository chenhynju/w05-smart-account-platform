// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {SmartAccount} from "./SmartAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/// @notice Immutable deterministic factory. Deployment is permissionless and cannot change initializer ownership.
contract AccountFactory {
    IEntryPoint public immutable entryPoint;
    event AccountCreated(address indexed account, address indexed owner, address guardian, bytes32 salt);

    constructor(IEntryPoint ep) {
        entryPoint = ep;
    }

    function getAddress(address owner, address guardian, bytes32 salt) public view returns (address) {
        bytes32 codeHash =
            keccak256(abi.encodePacked(type(SmartAccount).creationCode, abi.encode(entryPoint, owner, guardian)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }

    function createAccount(address owner, address guardian, bytes32 salt) external returns (SmartAccount account) {
        address predicted = getAddress(owner, guardian, salt);
        if (predicted.code.length != 0) return SmartAccount(payable(predicted));
        account = new SmartAccount{salt: salt}(entryPoint, owner, guardian);
        emit AccountCreated(address(account), owner, guardian, salt);
    }
}
