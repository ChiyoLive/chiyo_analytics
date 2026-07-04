import { NextResponse } from "next/server";

export async function GET() {
  // ⚠️ 仅供示例/测试使用：这是 /api/cyanly-token 中测试私钥对应的公钥。
  // 生产环境请暴露你自己私钥对应的公钥，切勿使用此处的测试密钥。
  const jwks = {
    keys: [
      {
        kty: "RSA",
        n: "rSnv_mAed5MkFm_teDz5xMk5OcYNsRW3lftGoYjceQf56nIyAEnf0H_UMJW3p2rYCY4OAVZ_0Bm0kFaE7gZ44cL_uqYRUwWCcTpf5DQ7-qAV1pL3X_cHqwBHQS1O7WuRN4ukTVmvDPlj5HCIXbJOKjFsLIVgBBONYuKdkP6SkGRYv8DzNq3C2APTvpHWgSFtuKdXVjaOP8FOuaDwSEFuWiNDs95cfhdbXaNjP80vSz4mT_IiENNekz8N3-R5fwbIqwaEvZxA2kdxRYZp_4E34AoId8OXD8qPfa4B_lnPulLy5JNMnkdn5TAP4LHPdqPkmpDxucOFETUUiyXWyTpq3w",
        e: "AQAB",
        kid: "test-key-id",
        alg: "RS256",
        use: "sig",
      },
    ],
  };

  return NextResponse.json(jwks);
}
