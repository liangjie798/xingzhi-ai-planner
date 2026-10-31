import { NextResponse } from "next/server";
import { AIRLINE_TOOLS, airlineCoverage, executeAirlineTool } from "@/lib/airline-tools-server";

export const maxDuration=60;
export async function GET(){return NextResponse.json({tools:AIRLINE_TOOLS,coverage:airlineCoverage()},{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
  try{
    const body=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body)||typeof body.name!=="string"||Object.keys(body).some(key=>!["name","arguments"].includes(key)))return NextResponse.json({detail:"工具调用格式无效"},{status:400});
    return NextResponse.json({name:body.name,result:await executeAirlineTool(body.name,body.arguments,request.signal)},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({detail:"工具名称或参数无效"},{status:400});}
}
