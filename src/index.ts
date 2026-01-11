import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "@trezoa-program/token";
import {
  findAssociatedTokenPda,
  getMintDecoder,
  TOKEN_2022_PROGRAM_ADDRESS,
  getCreateAssociatedTokenInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@trezoa-program/token-2022";
import {
  Address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  fetchEncodedAccount,
  getSignatureFromTransaction,
  Instruction,
  isTrezoaError,
  pipe,
  Rpc,
  RpcSubscriptions,
  SendableTransaction,
  sendAndConfirmTransactionFactory,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  TREZOA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  TrezoaRpcApi,
  TrezoaRpcSubscriptionsApi,
  Transaction,
  TransactionSigner,
  TransactionWithBlockhashLifetime,
} from "@trezoa/kit";
import {
  isTokenAclMintFromMint,
  createThawPermissionlessInstructionFromMint,
} from "@token-acl/sdk";

/**
 * Creates the instructions to create an associated token account
 * @param rpc - The RPC client
 * @param payer - The address of the payer
 * @param owner - The address of the owner
 * @param mintAddress - The address of the mint
 * @param idempotent - Whether to use idempotent instructions
 * @returns An object containing the instructions and the associated token address
 */
export async function createAssociatedTokenAccountInstructions(
  rpc: Rpc<TrezoaRpcApi>,
  payer: TransactionSigner,
  owner: Address,
  mintAddress: Address,
  idempotent: boolean = false,
): Promise<{ instructions: Instruction[]; associatedTokenAddress: Address }> {
  const mintAccount = await fetchEncodedAccount(rpc, mintAddress, {
    commitment: "confirmed",
  });
  if (
    !mintAccount.exists ||
    (mintAccount.programAddress != TOKEN_2022_PROGRAM_ADDRESS &&
      mintAccount.programAddress != TOKEN_PROGRAM_ADDRESS)
  ) {
    throw new Error("Provided mintAddress is not a valid token mint");
  }
  const tokenProgram = mintAccount.programAddress;

  const [associatedTokenAddress] = await findAssociatedTokenPda(
    {
      mint: mintAddress,
      owner: owner,
      tokenProgram: tokenProgram,
    },
    { programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS },
  );

  const createAtaInstruction = idempotent
    ? getCreateAssociatedTokenIdempotentInstruction(
        {
          ata: associatedTokenAddress,
          mint: mintAddress,
          owner: owner,
          payer: payer,
          tokenProgram: tokenProgram,
        },
        { programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS },
      )
    : getCreateAssociatedTokenInstruction(
        {
          ata: associatedTokenAddress,
          mint: mintAddress,
          owner: owner,
          payer: payer,
          tokenProgram: tokenProgram,
        },
        { programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS },
      );

  if (tokenProgram == TOKEN_PROGRAM_ADDRESS) {
    return {
      instructions: [createAtaInstruction],
      associatedTokenAddress: associatedTokenAddress,
    };
  }

  const mint = getMintDecoder().decode(mintAccount.data);

  const isTokenAclMint = await isTokenAclMintFromMint(mint);

  if (!isTokenAclMint) {
    return {
      instructions: [createAtaInstruction],
      associatedTokenAddress: associatedTokenAddress,
    };
  }

  const thawInstruction = await createThawPermissionlessInstructionFromMint(
    rpc,
    mint,
    mintAddress,
    owner,
    associatedTokenAddress,
    payer,
    idempotent,
  );

  return {
    instructions: [createAtaInstruction, thawInstruction],
    associatedTokenAddress: associatedTokenAddress,
  };
}

/**
 * Creates an associated token account without confirming the transaction
 * @param rpc - The RPC client
 * @param payer - The address of the payer
 * @param owner - The address of the owner
 * @param mintAddress - The address of the mint
 * @param idempotent - Whether to use idempotent instructions
 * @returns An object containing the signature and the associated token address
 */
export async function createAssociatedTokenAccount(
  rpc: Rpc<TrezoaRpcApi>,
  payer: TransactionSigner,
  owner: Address,
  mint: Address,
  idempotent: boolean = false,
): Promise<{ signature: string; associatedTokenAddress: Address }> {
  const { instructions, associatedTokenAddress } =
    await createAssociatedTokenAccountInstructions(
      rpc,
      payer,
      owner,
      mint,
      idempotent,
    );

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);
  const signature = getSignatureFromTransaction(signedTransaction);
  const sendTransaction = sendTransactionWithoutConfirmingFactory({ rpc });

  try {
    await sendTransaction(signedTransaction, { commitment: "confirmed" });
  } catch (e) {
    if (
      isTrezoaError(
        e,
        TREZOA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
      )
    ) {
      throw new Error("The transaction failed in simulation", e.cause);
    } else {
      throw e;
    }
  }
  return {
    signature: signature,
    associatedTokenAddress: associatedTokenAddress,
  };
}

/**
 * Creates an associated token account and confirms the transaction
 * @param rpc - The RPC client
 * @param rpcSubscriptions - The RPC subscriptions client
 * @param payer - The address of the payer
 * @param owner - The address of the owner
 * @param mintAddress - The address of the mint
 * @param idempotent - Whether to use idempotent instructions
 * @returns An object containing the signature and the associated token address
 */
export async function createAndConfirmAssociatedTokenAccount(
  rpc: Rpc<TrezoaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<TrezoaRpcSubscriptionsApi>,
  payer: TransactionSigner,
  owner: Address,
  mint: Address,
  idempotent: boolean = false,
): Promise<{ signature: string; associatedTokenAddress: Address }> {
  const { instructions, associatedTokenAddress } =
    await createAssociatedTokenAccountInstructions(
      rpc,
      payer,
      owner,
      mint,
      idempotent,
    );

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);
  const signature = getSignatureFromTransaction(signedTransaction);
  const sendTransaction = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });

  try {
    await sendTransaction(
      signedTransaction as SendableTransaction &
        Transaction &
        TransactionWithBlockhashLifetime,
      { commitment: "confirmed" },
    );
  } catch (e) {
    if (
      isTrezoaError(
        e,
        TREZOA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
      )
    ) {
      throw new Error("The transaction failed in simulation", e.cause);
    } else {
      throw e;
    }
  }
  return {
    signature: signature,
    associatedTokenAddress: associatedTokenAddress,
  };
}
