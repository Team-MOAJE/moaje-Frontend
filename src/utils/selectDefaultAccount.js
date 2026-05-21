export const selectDefaultAccount = accounts => {
  if (!accounts?.length) return null;
  return accounts.find(a => a.isPrimary) ?? accounts[0];
};
