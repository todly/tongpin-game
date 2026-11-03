import { toBlob } from 'html-to-image';
export function paginate(heights:number[], limit=7000):number[][] {
 const pages:number[][]=[];let page:number[]=[];let height=0;
 heights.forEach((h,i)=>{if(h>limit)throw new Error('单条记录过长，请减少记录长度后重试。');if(height+h>limit&&page.length){pages.push(page);page=[];height=0;}page.push(i);height+=h;});if(page.length)pages.push(page);return pages;
}
export async function exportReport(root:HTMLElement):Promise<File[]> {
 await document.fonts.ready;
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const blocks=Array.from(root.querySelectorAll<HTMLElement>('[data-report-block]'));
 const pages=paginate(blocks.map(b=>b.getBoundingClientRect().height+24));
 const files:File[]=[];
 for(const [index,indices] of pages.entries()) {
 const page=document.createElement('div');page.className='share-report export-page';page.style.width='640px';
 indices.forEach(i=>page.append(blocks[i]!.cloneNode(true)));document.body.append(page);
 try {const blob=await toBlob(page,{pixelRatio:1,backgroundColor:'#ffffff',width:640});if(!blob)throw new Error('图片生成失败，请重试。');files.push(new File([blob],`同频游戏-${index+1}.png`,{type:'image/png'}));}finally{page.remove();}
 }
 return files;
}
export async function shareFiles(files:File[]):Promise<string> {
 if(navigator.canShare?.({files})&&navigator.share) {try {await navigator.share({files,title:'同频游戏'});return `已分享，共 ${files.length} 张图片。`;}catch(error){if(error instanceof Error&&error.name==='AbortError')return '已取消分享，游戏记录不受影响。';}}
 for(const file of files){const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return `系统文件分享不可用，已下载 ${files.length} 张完整图片。`;
}
