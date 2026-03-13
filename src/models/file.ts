/**
 * File management data models and interfaces
 */

/**
 * File upload information and progress tracking
 */
export interface UploadInfo {
  uploadId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
}

/**
 * File download information and progress tracking
 */
export interface DownloadInfo {
  attachmentId: string;
  fileName: string;
  progress: number;
  status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
}
