// Constrói a URL pública (servida pelo nosso próprio site) de uma foto da
// biblioteca. O Blob Store do Vercel é privado (`access: "private"` em
// app/api/photos/upload/route.ts), então `photo.url` NUNCA deve ser usada
// diretamente em um <img src> ou background-image — ela não é acessível pelo
// navegador. Esta rota faz o proxy do conteúdo via app/api/photos/file/[id].
export function photoFileUrl(photoId: string): string {
  return `/api/photos/file/${photoId}`;
}
