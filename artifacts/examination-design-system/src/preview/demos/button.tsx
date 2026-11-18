import { useState } from "react";
import { Button } from "../../components/ui/button";
export default function ButtonDemo() {
  const [count,setCount] = useState(0);
  return <div className="ds-page-stack"><div className="ds-button-row">{(["gold","secondary","ghost"] as const).map(variant => <Button key={variant} variant={variant} onClick={() => setCount(count+1)}>{variant}</Button>)}</div><div className="ds-button-row"><Button size="small" variant="gold" onClick={() => setCount(count+1)}>Small action</Button><Button size="small" disabled>Small disabled</Button><Button variant="gold" disabled>Primary disabled</Button></div><p role="status">{count} specimen actions activated. Tab to a button and use Enter or Space.</p></div>;
}
