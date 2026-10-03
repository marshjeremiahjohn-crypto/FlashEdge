export function TransactionStatus({ lastBuild, buildError }) {
  return (
    <>
      {lastBuild && (
        <div data-testid="transaction-build-summary" className="border border-[#2A2A2A] bg-black p-3 text-sm text-zinc-300">
          <p data-testid="transaction-build-function" className="font-mono text-[#00FF66]">{lastBuild.function_name}</p>
          <p data-testid="transaction-build-status" className="mt-1 text-zinc-500">Ready: {String(lastBuild.is_ready_to_send)}</p>
        </div>
      )}

      {buildError && (
        <div data-testid="transaction-build-error" className="border border-[#FF3B30]/40 bg-[#FF3B30]/10 p-3 text-sm text-[#FF8A84]">
          {buildError}
        </div>
      )}
    </>
  );
}