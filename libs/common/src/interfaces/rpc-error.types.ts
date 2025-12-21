export interface RpcError {
  message: string | string[];
  statusCode: number;
  error?: string;
}

export function isRpcError(e: any): e is RpcError {
  return (
    typeof e === 'object' && e !== null && 'statusCode' in e && 'message' in e
  );
}
