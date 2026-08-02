export async function friendbotFund(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot funding failed: ${res.status}`);
  }
}
