import {
  call_rpc as inner_call_rpc,
  RpcRequest,
  RequestResponse,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

const debugEnabled = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("zmk.rpc.debug") === "1";
  } catch {
    return false;
  }
})();

export async function call_rpc(
  conn: RpcConnection,
  req: RpcRequest
): Promise<RequestResponse> {
  if (debugEnabled) console.log("RPC Request", req);
  return inner_call_rpc(conn, req)
    .then((r) => {
      if (debugEnabled && !req.pairing?.generateAndPair) console.log("RPC Response", r);
      return r;
    })
    .catch((e) => {
      console.error("RPC Error", e);
      return e;
    });
}
