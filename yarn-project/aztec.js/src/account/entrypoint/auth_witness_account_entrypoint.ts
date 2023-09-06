import { AztecAddress, Fr, FunctionData, PartialAddress, PrivateKey, TxContext } from '@aztec/circuits.js';
import { Signer } from '@aztec/circuits.js/barretenberg';
import { ContractAbi, FunctionAbi, encodeArguments } from '@aztec/foundation/abi';
import { FunctionCall, PackedArguments, TxExecutionRequest } from '@aztec/types';

import SchnorrAuthWitnessAccountContractAbi from '../../abis/schnorr_auth_witness_account_contract.json' assert { type: 'json' };
import { generatePublicKey } from '../../index.js';
import { DEFAULT_CHAIN_ID, DEFAULT_VERSION } from '../../utils/defaults.js';
import { buildPayload, hashPayload } from './entrypoint_payload.js';
import { CreateTxRequestOpts, Entrypoint } from './index.js';

/**
 * Account contract implementation that uses a single key for signing and encryption. This public key is not
 * stored in the contract, but rather verified against the contract address. Note that this approach is not
 * secure and should not be used in real use cases.
 * The entrypoint is extended to support signing and creating eip1271-like witnesses.
 */
export class AuthWitnessAccountEntrypoint implements Entrypoint {
  constructor(
    private address: AztecAddress,
    private partialAddress: PartialAddress,
    private privateKey: PrivateKey,
    private signer: Signer,
    private chainId: number = DEFAULT_CHAIN_ID,
    private version: number = DEFAULT_VERSION,
  ) {}

  /**
   * Sign a message hash with the private key.
   * @param message - The message hash to sign.
   * @returns The signature as a Buffer.
   */
  public sign(message: Buffer): Buffer {
    return this.signer.constructSignature(message, this.privateKey).toBuffer();
  }

  /**
   * Creates an AuthWitness witness for the given message. In this case, witness is the public key, the signature
   * and the partial address, to be used for verification.
   * @param message - The message hash to sign.
   * @returns [publicKey, signature, partialAddress] as Fr[].
   */
  async createAuthWitness(message: Buffer): Promise<Fr[]> {
    const signature = this.sign(message);
    const publicKey = await generatePublicKey(this.privateKey);

    const sigFr: Fr[] = [];
    for (let i = 0; i < 64; i++) {
      sigFr.push(new Fr(signature[i]));
    }

    return [...publicKey.toFields(), ...sigFr, this.partialAddress];
  }

  /**
   * Returns the transaction request and the auth witness for the given function calls.
   * Returning the witness here as a nonce is generated in the buildPayload action.
   * @param executions - The function calls to execute
   * @param opts - The options
   * @returns The TxRequest, the auth witness to insert in db and the message signed
   */
  async createTxExecutionRequestWithWitness(
    executions: FunctionCall[],
    opts: CreateTxRequestOpts = {},
  ): Promise<{
    /** The transaction request */
    txRequest: TxExecutionRequest;
    /** The auth witness */
    witness: Fr[];
    /** The message signed */
    message: Buffer;
  }> {
    if (opts.origin && !opts.origin.equals(this.address)) {
      throw new Error(`Sender ${opts.origin.toString()} does not match account address ${this.address.toString()}`);
    }

    const { payload, packedArguments: callsPackedArguments } = await buildPayload(executions);
    const message = await hashPayload(payload);
    const witness = await this.createAuthWitness(message);

    const args = [payload];
    const abi = this.getEntrypointAbi();
    const packedArgs = await PackedArguments.fromArgs(encodeArguments(abi, args));
    const txRequest = TxExecutionRequest.from({
      argsHash: packedArgs.hash,
      origin: this.address,
      functionData: FunctionData.fromAbi(abi),
      txContext: TxContext.empty(this.chainId, this.version),
      packedArguments: [...callsPackedArguments, packedArgs],
    });

    return { txRequest, message, witness };
  }

  createTxExecutionRequest(executions: FunctionCall[], _opts: CreateTxRequestOpts = {}): Promise<TxExecutionRequest> {
    throw new Error(`Not implemented, use createTxExecutionRequestWithWitness instead`);
  }

  private getEntrypointAbi(): FunctionAbi {
    const abi = (SchnorrAuthWitnessAccountContractAbi as any as ContractAbi).functions.find(
      f => f.name === 'entrypoint',
    );
    if (!abi) throw new Error(`Entrypoint abi for account contract not found`);
    return abi;
  }
}
