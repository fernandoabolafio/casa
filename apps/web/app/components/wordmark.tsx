import { Link } from "react-router";

import { PRODUCT_NAME, wordmarkClass } from "~/lib/brand";

export function Wordmark({ to }: { to?: string }) {
  if (to) {
    return (
      <Link to={to} className={wordmarkClass}>
        {PRODUCT_NAME}
      </Link>
    );
  }

  return <p className={wordmarkClass}>{PRODUCT_NAME}</p>;
}
