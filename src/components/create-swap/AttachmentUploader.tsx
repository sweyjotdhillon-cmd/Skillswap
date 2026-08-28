import { useRef, useState } from 'react';

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
}

type AttachmentUploaderProps = {
  attachments: AttachmentItem[];
  onAddAttachments: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(fileName: string, type: string) {
  const isPdf = fileName.toLowerCase().endsWith('.pdf') || type.includes('pdf');
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName) || type.startsWith('image/');

  if (isPdf) {
    return (
      <svg className="file-icon file-icon--pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }

  if (isImage) {
    return (
      <svg className="file-icon file-icon--img" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  return (
    <svg className="file-icon file-icon--doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

export function AttachmentUploader({ attachments, onAddAttachments, onRemoveAttachment }: AttachmentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddAttachments(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddAttachments(e.dataTransfer.files);
    }
  };

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label className="form-label">
          Attachments
        </label>
        <span className="badge-optional">(optional)</span>
      </div>

      <div className="attachments-wrapper">
        <div
          className={`dropzone ${isDragOver ? 'dropzone--active' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          tabIndex={0}
          role="button"
          aria-label="Upload files or drag and drop"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden-file-input"
            onChange={handleFileChange}
          />
          <div className="dropzone-content">
            <span className="dropzone-add-text">+ Add attachments</span>
            <span className="dropzone-subtext">Upload files or drag and drop</span>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="attachment-list" aria-label="Attached files">
            {attachments.map((item) => (
              <div key={item.id} className="attachment-card">
                <div className="attachment-info">
                  {getFileIcon(item.name, item.type)}
                  <div className="attachment-details">
                    <span className="attachment-name" title={item.name}>{item.name}</span>
                    <span className="attachment-size">{formatFileSize(item.size)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="attachment-remove-btn"
                  onClick={() => onRemoveAttachment(item.id)}
                  aria-label={`Remove attachment ${item.name}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
