import { createInterviewHandler } from './handler.ts';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
Deno.serve(createInterviewHandler(Deno.env));
