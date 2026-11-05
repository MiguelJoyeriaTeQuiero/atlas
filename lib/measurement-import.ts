import { type Measurement } from './domain';
export const MEASUREMENT_COLUMNS = ['processId','month','volume','minutesPerCase','peoplePerCase','errors','minutesPerError','reviewMinutes','runningCost','maintenanceCost','aiCost','realCashSaved','source'] as const;
/** RFC-style quoted fields, CRLF, UTF-8 BOM and either comma or semicolon separator. */
export function parseCSV(text: string): string[][] {
  const source=text.replace(/^\uFEFF/,''); const first=source.split(/\r?\n/)[0]; const delimiter=first.includes(';')?';':',';
  const rows:string[][]=[]; let row:string[]=[], field='', quoted=false;
  for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else throw new Error('Comillas inesperadas en el CSV.');}else if(!quoted&&c===delimiter){row.push(field);field='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.trim()))rows.push(row);row=[];field='';}else field+=c;}
  if(quoted)throw new Error('El CSV contiene comillas sin cerrar.');row.push(field);if(row.some(s=>s.trim()))rows.push(row);return rows;
}
export function parseMeasurements(text:string):Measurement[]{
  const rows=parseCSV(text); if(rows.length<2)throw new Error('El archivo necesita cabecera y al menos una medición.');if(rows.length>501)throw new Error('Importa como máximo 500 mediciones por archivo.');
  const headers=rows[0].map(s=>s.trim());if(new Set(headers).size!==headers.length)throw new Error('La cabecera tiene columnas repetidas.');
  for(const key of MEASUREMENT_COLUMNS.filter(k=>k!=='maintenanceCost'&&k!=='aiCost'))if(!headers.includes(key))throw new Error(`Falta la columna ${key}.`);
  return rows.slice(1).map((row,index)=>{if(row.length!==headers.length)throw new Error(`Fila ${index+2}: el número de columnas no coincide.`);const raw=Object.fromEntries(headers.map((k,i)=>[k,row[i].trim()]));const data:any={id:crypto.randomUUID(),validated:false,notes:'Importación CSV pendiente de validación.',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    for(const key of MEASUREMENT_COLUMNS){if(['processId','month','source'].includes(key)){data[key]=raw[key]??'';continue;}const value=raw[key]??'0';if(!value||!/^\d+(?:[.,]\d+)?$/.test(value))throw new Error(`Fila ${index+2}: ${key} debe ser un número positivo o cero, sin separador de miles.`);data[key]=Number(value.replace(',','.'));}
    return data as Measurement;
  });
}
