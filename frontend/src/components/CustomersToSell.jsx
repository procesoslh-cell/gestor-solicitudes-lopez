import CreditAccounts from "./CreditAccounts";

function CustomersToSell({ user }) {
  return <CreditAccounts user={user} mode="sell" />;
}

export default CustomersToSell;
