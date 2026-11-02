// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {SmartAccount} from "../../contracts/SmartAccount.sol";
import {Counter} from "../../contracts/Counter.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {Vm} from "./Account.t.sol";

contract OperationHandler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    EntryPoint public ep;
    SmartAccount public account;
    Counter public counter;
    uint256 public modelCounter;
    uint256 public sessionSpent;
    uint256 public successful;
    uint256 public rejected;

    constructor(EntryPoint e, SmartAccount a, Counter c) {
        ep = e;
        account = a;
        counter = c;
    }
    receive() external payable {}

    function rawSig(uint256 key, bytes32 h) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encodePacked(r, s, v);
    }

    function step(uint96 amount, uint8 mode) external {
        uint256 kind = uint256(mode) % 4;
        uint256 delta = uint256(amount) % 1000 + 1;
        SmartAccount.Action[] memory a = new SmartAccount.Action[](kind == 3 ? 2 : 1);
        uint256 value = kind == 1 ? uint256(amount) % 31 : 0;
        a[0] = SmartAccount.Action(address(counter), value, abi.encodeCall(Counter.increment, (delta)));
        if (kind == 3) a[1] = SmartAccount.Action(address(counter), 0, abi.encodeCall(Counter.fail, ()));
        PackedUserOperation memory op;
        op.sender = address(account);
        op.nonce = ep.getNonce(address(account), 0);
        op.callData = abi.encodeCall(SmartAccount.executeOperation, (op.nonce, account.epoch(), a));
        op.accountGasLimits = bytes32(uint256(3000000) << 128 | uint256(1500000));
        op.preVerificationGas = 100000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(2 gwei));
        op.signature = abi.encodePacked(
            uint8(kind == 1 ? 1 : 0),
            rawSig(kind == 1 ? uint256(0xb0b) : kind == 2 ? uint256(0xbad) : uint256(0xa11ce), ep.getUserOpHash(op))
        );
        PackedUserOperation[] memory list = new PackedUserOperation[](1);
        list[0] = op;
        bool mustReject = kind == 2 || (kind == 1 && sessionSpent + value > 1000);
        try ep.handleOps(list, payable(address(this))) {
            require(!mustReject, "accepted invalid authorization");
            if (kind != 3) {
                modelCounter += delta;
                ++successful;
                if (kind == 1) sessionSpent += value;
            }
        } catch {
            require(mustReject, "valid path rejected");
            ++rejected;
        }
        require(counter.number() == modelCounter, "counter model mismatch");
    }

    function unauthorized(uint256 nonce) external {
        SmartAccount.Action[] memory a = new SmartAccount.Action[](1);
        a[0] = SmartAccount.Action(address(counter), 0, abi.encodeCall(Counter.increment, (1)));
        try account.executeOperation(nonce, account.epoch(), a) {
            revert("direct authorization bypass");
        } catch {
            ++rejected;
        }
    }
}

contract StatefulTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    OperationHandler public handler;
    SmartAccount public account;
    Counter public counter;
    address[] private targets;
    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 1000 ether);
        vm.warp(1000);
        EntryPoint ep = new EntryPoint();
        account = new SmartAccount(ep, vm.addr(0xa11ce), vm.addr(0xdad));
        counter = new Counter();
        vm.deal(address(account), 100 ether);
        ep.depositTo{value: 10 ether}(address(account));
        // Configuration is covered through actual owner UserOps in AccountTest; this fixture isolates randomized execution.
        vm.prank(address(account));
        account.setSession(vm.addr(0xb0b), address(counter), Counter.increment.selector, type(uint48).max, 1000);
        handler = new OperationHandler(ep, account, counter);
        targets.push(address(handler));
    }

    function targetContracts() external view returns (address[] memory) {
        return targets;
    }

    function invariant_CounterMatchesModel() external view {
        require(counter.number() == handler.modelCounter());
    }

    function invariant_SessionNeverOverspends() external view {
        (,,, uint256 remaining,) = account.sessions(vm.addr(0xb0b));
        require(handler.sessionSpent() <= 1000);
        require(remaining + handler.sessionSpent() == 1000);
    }

    function invariant_OwnershipNeverChanges() external view {
        require(account.threshold() == 1);
        require(account.owners(vm.addr(0xa11ce)));
    }
}
