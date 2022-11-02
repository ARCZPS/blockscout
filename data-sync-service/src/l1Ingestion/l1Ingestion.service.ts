import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, Inject, CACHE_MANAGER } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  L1ToL2,
  L2ToL1,
  L1RelayedMessageEvents,
  L1SentMessageEvents,
  StateBatches,
  TxnBatches,
} from 'src/typeorm';
import { Repository, getManager, EntityManager, getConnection } from 'typeorm';
import Web3 from 'web3';
import CMGABI from '../abi/L1CrossDomainMessenger.json';
import CTCABI from '../abi/CanonicalTransactionChain.json';
import SCCABI from '../abi/StateCommitmentChain.json';

import { L2IngestionService } from './../l2Ingestion/l2Ingestion.service';

@Injectable()
export class L1IngestionService {
  private readonly logger = new Logger(L1IngestionService.name);
  entityManager: EntityManager;
  web3: Web3;
  ctcContract: any;
  sccContract: any;
  crossDomainMessengerContract: any;
  constructor(
    private configService: ConfigService,
    @InjectRepository(L1RelayedMessageEvents)
    private readonly relayedEventsRepository: Repository<L1RelayedMessageEvents>,
    @InjectRepository(L1SentMessageEvents)
    private readonly sentEventsRepository: Repository<L1SentMessageEvents>,
    private readonly l2IngestionService: L2IngestionService,
  ) {
    this.entityManager = getManager();
    const web3 = new Web3(
      new Web3.providers.HttpProvider(configService.get('L1_RPC')),
    );
    const crossDomainMessengerContract = new web3.eth.Contract(
      CMGABI as any,
      configService.get('L1_CROSS_DOMAIN_MESSENGER_ADDRESS'),
    );
    const ctcContract = new web3.eth.Contract(
      CTCABI as any,
      configService.get('CTC_ADDRESS'),
    );
    const sccContract = new web3.eth.Contract(
      SCCABI as any,
      configService.get('SCC_ADDRESS'),
    );
    this.ctcContract = ctcContract;
    this.sccContract = sccContract;
    this.crossDomainMessengerContract = crossDomainMessengerContract;
    this.web3 = web3;
  }
  async getCtcTransactionEnqueuedByBlockNumber(
    fromBlock: number,
    toBlock: number,
  ) {
    return this.ctcContract.getPastEvents('TransactionEnqueued', {
      fromBlock,
      toBlock,
    });
  }
  async getCtcTransactionBatchAppendedByBlockNumber(
    fromBlock: number,
    toBlock: number,
  ) {
    return this.ctcContract.getPastEvents('TransactionBatchAppended', {
      fromBlock,
      toBlock,
    });
  }
  async getSccStateBatchAppendedByBlockNumber(
    fromBlock: number,
    toBlock: number,
  ) {
    return this.sccContract.getPastEvents('StateBatchAppended', {
      fromBlock,
      toBlock,
    });
  }
  async getSentMessageByBlockNumber(fromBlock: number, toBlock: number) {
    return this.crossDomainMessengerContract.getPastEvents('SentMessage', {
      fromBlock,
      toBlock,
    });
  }
  async getRelayedMessageByBlockNumber(fromBlock: number, toBlock: number) {
    return this.crossDomainMessengerContract.getPastEvents('RelayedMessage', {
      fromBlock,
      toBlock,
    });
  }
  verifyDomainCalldataHash({ target, sender, message, messageNonce }): string {
    const xDomainCalldata = this.web3.eth.abi.encodeFunctionCall(
      {
        name: 'relayMessage',
        type: 'function',
        inputs: [
          { type: 'address', name: 'target' },
          { type: 'address', name: 'sender' },
          { type: 'bytes', name: 'message' },
          { type: 'uint256', name: 'messageNonce' },
        ],
      },
      [target, sender, message, messageNonce],
    );
    const xDomainCalldataHash = Web3.utils.keccak256(xDomainCalldata);
    return xDomainCalldataHash;
  }
  async getCurrentBlockNumber(): Promise<number> {
    return this.web3.eth.getBlockNumber();
  }
  async getSentEventsBlockNumber(): Promise<number> {
    const result = await this.sentEventsRepository
      .createQueryBuilder()
      .select('Max(block_number)', 'blockNumber')
      .getRawOne();
    return Number(result.blockNumber) || 0;
  }
  async getRelayedEventsBlockNumber(): Promise<number> {
    const result = await this.relayedEventsRepository
      .createQueryBuilder()
      .select('Max(block_number)', 'blockNumber')
      .getRawOne();
    return Number(result.blockNumber) || 0;
  }
  async createTxnBatchesEvents(startBlock, endBlock) {
    const result: any[] = [];
    const list = await this.getCtcTransactionBatchAppendedByBlockNumber(
      startBlock,
      endBlock,
    );
    for (const item of list) {
      const {
        blockNumber,
        transactionHash,
        returnValues: {
          _batchIndex,
          _batchRoot,
          _batchSize,
          _prevTotalElements,
          _signature,
        },
      } = item;
      const { timestamp } = await this.web3.eth.getBlock(blockNumber);
      try {
        const savedResult = await this.entityManager.save(TxnBatches, {
          batch_index: _batchIndex,
          hash: transactionHash,
          size: _batchSize,
          pre_total_elements: _prevTotalElements,
          timestamp: new Date(Number(timestamp) * 1000).toISOString(),
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result.push(savedResult);
      } catch (error) {
        this.logger.error(
          `l1 createTxnBatchesEvents blocknumber:${blockNumber} ${error}`,
        );
      }
    }
    return result;
  }
  async createStateBatchesEvents(startBlock, endBlock) {
    const result: any[] = [];
    const list = await this.getSccStateBatchAppendedByBlockNumber(
      startBlock,
      endBlock,
    );
    for (const item of list) {
      const {
        blockNumber,
        transactionHash,
        returnValues: {
          _batchIndex,
          _batchRoot,
          _batchSize,
          _prevTotalElements,
          _signature,
        },
      } = item;
      const { timestamp } = await this.web3.eth.getBlock(blockNumber);
      try {
        const savedResult = await this.entityManager.save(StateBatches, {
          batch_index: _batchIndex,
          hash: transactionHash,
          size: _batchSize,
          pre_total_elements: _prevTotalElements,
          timestamp: new Date(Number(timestamp) * 1000).toISOString(),
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result.push(savedResult);
      } catch (error) {
        this.logger.error(
          `l1 createStateBatchesEvents blocknumber:${blockNumber} ${error}`,
        );
      }
    }
    return result;
  }
  async createEnqueuedEvents(startBlock, endBlock) {
    const list = await this.getCtcTransactionEnqueuedByBlockNumber(startBlock, endBlock);
    const result: any[] = [];
    for (const item of list) {
      const {
        blockNumber,
        transactionHash,
        signature,
        address,
        returnValues: {_l1TxOrigin, _target, _gasLimit, _queueIndex, _timestamp },
      } = item;
      try {
        const savedResult = await this.entityManager.save(L1SentMessageEvents, {
          tx_hash: transactionHash,
          block_number: blockNumber.toString(),
          target: _target,
          sender: address,
          message: signature,
          message_nonce: _queueIndex,
          gas_limit: _gasLimit,
          signature: signature,
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result.push(savedResult);
      } catch (error) {
        this.logger.error(
          `l1 createEnqueuedEvents blocknumber:${blockNumber} ${error}`,
        );
      }
    }
    return result;
  }
  async createSentEvents(startBlock, endBlock) {
    const list = await this.getSentMessageByBlockNumber(startBlock, endBlock);
    const result: any[] = [];
    for (const item of list) {
      const {
        blockNumber,
        transactionHash,
        returnValues: { target, sender, message, messageNonce, gasLimit },
        signature,
      } = item;
      try {
        const savedResult = await this.entityManager.save(L1SentMessageEvents, {
          tx_hash: transactionHash,
          block_number: blockNumber.toString(),
          target,
          sender,
          message,
          message_nonce: messageNonce,
          gas_limit: gasLimit,
          signature,
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result.push(savedResult);
      } catch (error) {
        this.logger.error(
          `l1 createSentEvents blocknumber:${blockNumber} ${error}`,
        );
      }
    }
    return result;
  }
  async createRelayedEvents(startBlock, endBlock) {
    const list = await this.getRelayedMessageByBlockNumber(
      startBlock,
      endBlock,
    );
    const result: any = [];
    for (const item of list) {
      const {
        blockNumber,
        transactionHash,
        returnValues: { msgHash },
        signature,
      } = item;
      try {
        const savedResult = await this.entityManager.save(
          L1RelayedMessageEvents,
          {
            tx_hash: transactionHash,
            block_number: blockNumber.toString(),
            msg_hash: msgHash,
            signature,
            inserted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        );
        result.push(savedResult);
      } catch (error) {
        this.logger.error(
          `l1 createRelayedEvents blocknumber:${blockNumber} ${error}`,
        );
      }
    }
    return result;
  }
  async createL1L2Relation() {

  }
  async createL2L1Relation() {
    const sentList = await this.l2IngestionService.getUnMergeSentEvents();
    const result: any = [];
    for (const item of sentList) {
      const {
        tx_hash,
        block_number,
        gas_limit,
        target,
        sender,
        message,
        message_nonce,
      } = item;
      const msgHash = this.l2IngestionService.verifyDomainCalldataHash({
        target: target.toString(),
        sender: sender.toString(),
        message: message.toString(),
        messageNonce: message_nonce.toString(),
      });
      const relayedResult = await this.getRelayedEventByMsgHash(msgHash);
      let l1_hash = '';
      if (relayedResult) {
        l1_hash = relayedResult.tx_hash.toString();
      }
      console.log('relayedResult===', relayedResult);
      /*
       message_nonce: message_nonce.toString(),
        l2_tx_hash: item.tx_hash.toString(),
        l1_tx_hash: relayedResult ? relayedResult.tx_hash.toString() : null
      */
      const savedResult = await this.entityManager.save(L2ToL1, {
        hash: item.tx_hash,
        l2_hash: relayedResult ? relayedResult.tx_hash : null,
        block: Number(block_number),
        msg_nonce: message_nonce,
        from_address: sender,
        timestamp: new Date().toISOString(),
        gas_limit: gas_limit,
        gas_used: 0,
        gas_price: 0,
        fee_scalar: 0,
        txn_batch_index: message_nonce,
        state_batch_index: message_nonce,
        status: '',
        inserted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return result;
  }
  async syncSentEvents() {
    const startBlockNumber = await this.getSentEventsBlockNumber();
    const currentBlockNumber = await this.getCurrentBlockNumber();
    for (let i = startBlockNumber; i < currentBlockNumber; i += 1000) {
      const start = i === 0 ? 0 : i + 1;
      const end = Math.min(i + 1000, currentBlockNumber);
      const result = await this.createSentEvents(start, end);
      this.logger.log(
        `sync [${result.length}] l1_sent_message_events from block [${start}] to [${end}]`,
      );
    }
  }
  async syncRelayedEvents() {
    const startBlockNumber = await this.getRelayedEventsBlockNumber();
    const currentBlockNumber = await this.getCurrentBlockNumber();
    for (let i = startBlockNumber; i < currentBlockNumber; i += 1000) {
      const start = i === 0 ? 0 : i + 1;
      const end = Math.min(i + 1000, currentBlockNumber);
      const result = await this.createRelayedEvents(start, end);
      this.logger.log(
        `sync [${result.length}] l1_relayed_message_events from block [${start}] to [${end}]`,
      );
    }
  }
  async sync() {
    this.syncSentEvents();
    this.syncRelayedEvents();
  }
  async getRelayedEventByMsgHash(msgHash: string) {
    return this.relayedEventsRepository.findOne({
      where: { msg_hash: msgHash },
    });
  }
  async getRelayedEventByTxHash(txHash: string) {
    return this.relayedEventsRepository.findOne({
      where: { tx_hash: txHash },
    });
  }
  async getSentEventByTxHash(txHash: string) {
    return this.sentEventsRepository.findOne({
      where: { tx_hash: txHash },
    });
  }
  async getL1ToL2Relation() {
    const sentList = await this.sentEventsRepository.find();
    const result = [];
    for (const item of sentList) {
      const { target, sender, message, message_nonce } = item;
      const msgHash = this.verifyDomainCalldataHash({
        target: target.toString(),
        sender: sender.toString(),
        message: message.toString(),
        messageNonce: message_nonce.toString(),
      });
      const relayedResult =
        await this.l2IngestionService.getRelayedEventByMsgHash(msgHash);
      result.push({
        block_number: item.block_number,
        queue_index: message_nonce.toString(),
        l2_tx_hash: relayedResult.tx_hash.toString(),
        l1_tx_hash: item.tx_hash.toString(),
        gas_limit: item.gas_limit,
      });
    }
    return result;
  }
  async getL2ToL1Relation() {
    const sentList = await this.l2IngestionService.getAllSentEvents();
    const result = [];
    for (const item of sentList) {
      const { target, sender, message, message_nonce } = item;
      const msgHash = this.l2IngestionService.verifyDomainCalldataHash({
        target: target.toString(),
        sender: sender.toString(),
        message: message.toString(),
        messageNonce: message_nonce.toString(),
      });
      const relayedResult = await this.getRelayedEventByMsgHash(msgHash);
      result.push({
        message_nonce: message_nonce.toString(),
        l2_tx_hash: item.tx_hash.toString(),
        l1_tx_hash: relayedResult ? relayedResult.tx_hash.toString() : null,
      });
    }
    return result;
  }
}
