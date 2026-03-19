import type { AssetRecord } from '../types/models';

export function AssetPreviewModal({
  asset,
  onClose,
}: {
  asset: AssetRecord | null;
  onClose: () => void;
}) {
  if (!asset) {
    return null;
  }

  return (
    <div className="asset-modal-backdrop" onClick={onClose} role="presentation">
      <div className="asset-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="section-header">
          <div>
            <h2>{asset.fileName}</h2>
            <p className="helper-text">
              {asset.description || `${asset.relatedLabel ?? 'Attachment'} · ${asset.kind}`}
            </p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="asset-modal-body">
          {asset.kind === 'image' ? (
            <img alt={asset.fileName} className="asset-modal-image" src={asset.downloadUrl} />
          ) : (
            <iframe className="asset-modal-frame" src={asset.downloadUrl} title={asset.fileName} />
          )}
        </div>
      </div>
    </div>
  );
}

