// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
export const ANNOTATION_GEOMETRY = 'compact-font-disjoint-v1';

export function disjointRectUnion(rects) {
    const intersects = (a,b) => Math.min(a[2],b[2]) > Math.max(a[0],b[0]) && Math.min(a[3],b[3]) > Math.max(a[1],b[1]);
    if (!rects.some((a,i)=>rects.slice(i+1).some(b=>intersects(a,b)))) return rects;
    const edges = [...new Set(rects.flatMap(r=>[r[1],r[3]]))].sort((a,b)=>b-a);
    const output = [];
    let active = new Map();
    for (let i=0;i<edges.length-1;i++) {
        const top=edges[i], bottom=edges[i+1];
        const intervals=rects.filter(r=>r[1]<top && r[3]>bottom).map(r=>[r[0],r[2]]).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
        const merged=[];
        for (const [left,right] of intervals) {
            if(merged.length && left<=merged.at(-1)[1])merged.at(-1)[1]=Math.max(merged.at(-1)[1],right);
            else merged.push([left,right]);
        }
        const current=new Map();
        for(const [left,right] of merged) {
            const key=JSON.stringify([left,right]), previous=active.get(key);
            if(previous!==undefined && output[previous][1]===top) {
                output[previous][1]=bottom;current.set(key,previous);
            } else {
                current.set(key,output.length);output.push([left,bottom,right,top]);
            }
        }
        active=current;
    }
    return output;
}
