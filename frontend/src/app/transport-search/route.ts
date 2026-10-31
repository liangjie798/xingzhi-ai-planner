import { NextResponse } from "next/server";
import { searchTickets } from "@/lib/ticket-search-server";
import { searchTrains } from "@/lib/train-search-server";
export const maxDuration=60;
export async function POST(request:Request){
 try{const b=await request.json();if(![b?.origin,b?.destination,b?.date].every(v=>typeof v==='string'&&v.length<=30)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))return NextResponse.json({detail:'请填写有效的出发地、目的地和日期。'},{status:400});
 if(b.mode!==undefined&&!['flight','train'].includes(b.mode))return NextResponse.json({detail:'查询方式无效'},{status:400});
 if(b.mode==='flight')return NextResponse.json({flight:await searchTickets(b.origin.trim(),b.destination.trim(),b.date,{signal:request.signal})},{headers:{'Cache-Control':'no-store'}});
 if(b.mode==='train')return NextResponse.json({train:await searchTrains(b.origin.trim(),b.destination.trim(),b.date,request.signal)},{headers:{'Cache-Control':'no-store'}});
 const [flight,train]=await Promise.all([searchTickets(b.origin.trim(),b.destination.trim(),b.date,{signal:request.signal}),searchTrains(b.origin.trim(),b.destination.trim(),b.date,request.signal)]);
 return NextResponse.json({flight,train,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({detail:'交通查询失败，请稍后重试。'},{status:400});}
}
