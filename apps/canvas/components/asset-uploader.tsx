"use client";

import type { UploadedAsset } from "@/lib/types";

type AssetUploaderProps = {
  roomPhotos: UploadedAsset[];
  floorPlan: UploadedAsset | null;
  onRoomPhotosChange: (assets: UploadedAsset[]) => void;
  onFloorPlanChange: (asset: UploadedAsset | null) => void;
};

function createAsset(file: File): UploadedAsset {
  return {
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
  };
}

export function AssetUploader({
  roomPhotos,
  floorPlan,
  onRoomPhotosChange,
  onFloorPlanChange,
}: AssetUploaderProps) {
  return (
    <div className="sidebar panel">
      <div className="brand">
        <span className="eyebrow">Casa Studio</span>
        <h2>Room references</h2>
        <p className="small muted">
          Upload shots from different angles plus one floor plan. These become the
          reference set for the first generated scene.
        </p>
      </div>

      <section className="card">
        <h3>Room photos</h3>
        <label className="upload-zone">
          <span className="small">Choose multiple room-angle images</span>
          <input
            accept="image/*"
            multiple
            type="file"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              onRoomPhotosChange([...roomPhotos, ...files.map(createAsset)]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {roomPhotos.length > 0 ? (
          <div className="asset-grid">
            {roomPhotos.map((asset) => (
              <div className="asset-thumb" key={asset.id}>
                <img alt={asset.name} src={asset.previewUrl} />
                <span>{asset.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="small muted">No room photos yet.</p>
        )}
        <button
          className="button danger"
          disabled={roomPhotos.length === 0}
          type="button"
          onClick={() => onRoomPhotosChange([])}
        >
          Clear photos
        </button>
      </section>

      <section className="card">
        <h3>Floor plan</h3>
        <label className="upload-zone">
          <span className="small">Choose one floor plan image</span>
          <input
            accept="image/*"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              onFloorPlanChange(file ? createAsset(file) : null);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {floorPlan ? (
          <div className="asset-thumb">
            <img alt={floorPlan.name} src={floorPlan.previewUrl} />
            <span>{floorPlan.name}</span>
          </div>
        ) : (
          <p className="small muted">No floor plan selected.</p>
        )}
      </section>
    </div>
  );
}
