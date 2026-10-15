(()=>{
 const copy=document.getElementById('copy-result-link');
 if(copy)copy.addEventListener('click',async()=>{
  const input=document.getElementById('shared-result-url');const status=document.getElementById('copy-result-status');
  try{await navigator.clipboard.writeText(input.value);status.textContent='Enlace copiado.';}
  catch{input.focus();input.select();status.textContent='Enlace seleccionado. Copialo con Ctrl+C o desde el menú de tu dispositivo.';}
 });
 const search=document.getElementById('result-search');
 if(search){const normalize=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  const rows=Array.from(document.querySelectorAll('#result-rows tr')).map(row=>({row,text:normalize(row.textContent)}));
  search.addEventListener('input',()=>{const term=normalize(search.value.trim());let count=0;for(const item of rows){item.row.hidden=!item.text.includes(term);if(!item.row.hidden)count++;}document.getElementById('result-count').textContent=count+' de '+rows.length+' resultados';});
 }
})();
