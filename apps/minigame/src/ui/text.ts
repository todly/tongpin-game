export type TextMetrics={width:number;ascent:number;descent:number;ink:number;lineHeight:number;baseline:number};
export type MeasureText=(text:string,size:number,weight?:number)=>TextMetrics;
export type MeasureInput=MeasureText|((text:string,size:number,weight?:number)=>number);
export function normalizeMeasure(measure:MeasureInput):MeasureText{return (text,size,weight)=>{const value=measure(text,size,weight);return typeof value==='number'?{...stableTextMetrics({width:value},size),width:value}:value;};}

type NativeMetrics={width?:number;actualBoundingBoxAscent?:number;actualBoundingBoxDescent?:number};

// 微信部分基础库只返回 width；固定比例回退可避免不同机型出现 NaN 或基线跳动。
export function stableTextMetrics(value:NativeMetrics|undefined,size:number):TextMetrics{
 const width=Number.isFinite(value?.width)?Math.max(0,value!.width!):0;
 const actualAscent=value?.actualBoundingBoxAscent,actualDescent=value?.actualBoundingBoxDescent;
 const hasActual=Number.isFinite(actualAscent)&&actualAscent!>=0&&Number.isFinite(actualDescent)&&actualDescent!>=0&&(actualAscent!+actualDescent!>0);
 const ascent=hasActual?actualAscent!:size*.8,descent=hasActual?actualDescent!:size*.2;
 const ink=ascent+descent,lineHeight=Math.max(size,ink),leading=Math.max(0,lineHeight-ink);
 return {width,ascent,descent,ink,lineHeight,baseline:leading/2+ascent};
}

export function canvasMeasure(ctx:any):MeasureText{return (text,size,weight=400)=>{ctx.font=`${weight} ${size}px sans-serif`;return stableTextMetrics(ctx.measureText(text),size);};}

export function textBaselineY(y:number,h:number,metrics:TextMetrics){return y+(h-metrics.ink)/2+metrics.ascent;}
export function textInkBounds(y:number,metrics:TextMetrics){return {top:y+metrics.baseline-metrics.ascent,bottom:y+metrics.baseline+metrics.descent,height:metrics.ink};}
