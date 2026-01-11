import {
  assertAccountExists,
  fetchEncodedAccount,
  generateKeyPairSigner,
} from "@trezoa/kit";
import test from "ava";
import {
  AccountState,
  TOKEN_2022_PROGRAM_ADDRESS,
  Token,
  getTokenDecoder as getTokenDecoder2022,
} from "@trezoa-program/token-2022";
import {
  createDefaultTrezoaClient,
  createMint,
  createMint2022,
  createMintAcl,
  generateKeyPairSignerWithTrz,
} from "./_setup";
import { TOKEN_PROGRAM_ADDRESS, getTokenDecoder } from "@trezoa-program/token";
import { createAndConfirmAssociatedTokenAccount } from "../src";

test("it creates tokenkeg associated token account", async (t) => {
  t.timeout(30000);
  // Given a mint account and a token account.
  const client = createDefaultTrezoaClient();
  const [payer, mintAuthority, owner] = await Promise.all([
    generateKeyPairSignerWithTrz(client),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  const mint = await createMint(client, payer, mintAuthority.address);

  const ata = await createAndConfirmAssociatedTokenAccount(
    client.rpc,
    client.rpcSubscriptions,
    payer,
    owner.address,
    mint,
  );

  const account = await fetchEncodedAccount(
    client.rpc,
    ata.associatedTokenAddress,
  );
  assertAccountExists(account);
  t.is(account.programAddress, TOKEN_PROGRAM_ADDRESS);

  const tokenAccount = getTokenDecoder().decode(account.data);
  t.like(tokenAccount, <Token>{ amount: 0n, owner: owner.address, mint: mint });
});

test("it creates tokenZ associated token account", async (t) => {
  t.timeout(30000);
  // Given a mint account and a token account.
  const client = createDefaultTrezoaClient();
  const [payer, mintAuthority, owner] = await Promise.all([
    generateKeyPairSignerWithTrz(client),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  const mint = await createMint2022({
    client,
    payer,
    authority: mintAuthority,
  });

  const ata = await createAndConfirmAssociatedTokenAccount(
    client.rpc,
    client.rpcSubscriptions,
    payer,
    owner.address,
    mint,
  );

  const account = await fetchEncodedAccount(
    client.rpc,
    ata.associatedTokenAddress,
  );
  assertAccountExists(account);
  t.is(account.programAddress, TOKEN_2022_PROGRAM_ADDRESS);

  const tokenAccount = getTokenDecoder2022().decode(account.data);
  t.like(tokenAccount, <Token>{ amount: 0n, owner: owner.address, mint: mint });
});

test("it creates token-acl associated token account", async (t) => {
  t.timeout(30000);
  // Given a mint account and a token account.
  const client = createDefaultTrezoaClient();
  const [payer, mintAuthority, owner] = await Promise.all([
    generateKeyPairSignerWithTrz(client),
    generateKeyPairSignerWithTrz(client),
    generateKeyPairSigner(),
  ]);
  const mint = await createMintAcl(client, payer, mintAuthority);

  const ata = await createAndConfirmAssociatedTokenAccount(
    client.rpc,
    client.rpcSubscriptions,
    payer,
    owner.address,
    mint,
  );

  const account = await fetchEncodedAccount(
    client.rpc,
    ata.associatedTokenAddress,
  );
  assertAccountExists(account);
  t.is(account.programAddress, TOKEN_2022_PROGRAM_ADDRESS);

  const tokenAccount = getTokenDecoder2022().decode(account.data);
  t.like(tokenAccount, <Token>{
    amount: 0n,
    owner: owner.address,
    mint: mint,
    state: AccountState.Initialized,
  });
});
