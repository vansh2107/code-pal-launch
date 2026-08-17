import * as pdfjsLib from 'pdfjs-dist';

export const initPdfWorker = () => {
  // Use the local or CDN-hosted worker. For maximum reliability, we use the specific versioned URL.
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
};
