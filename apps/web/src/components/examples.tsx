"use client";

import { CopyInput } from "@/components/ui/copy-input";
import { useMemo } from "react";

export function Examples() {
  const exampleUrls = useMemo(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
    return [
      {
        title: "Download original image",
        url: `${apiBaseUrl}/download/gallery/image.png`,
      },
      {
        title: "Download nested path file",
        url: `${apiBaseUrl}/download/folder%20name/photo.jpg`,
      },
      {
        title: "Download original video",
        url: `${apiBaseUrl}/download/videos/clip.mp4`,
      },
      {
        title: "Get file metadata",
        url: `${apiBaseUrl}/storage/gallery/image.png/metadata`,
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-left text-xl font-semibold">
        Examples
      </h2>
    <div className="grid gap-4 md:grid-cols-2">
      {exampleUrls.map((example, index) => (
        <div
          key={index}
          className="p-4 rounded-lg border border-black/10 bg-neutral-50"
        >
          <h3 className="font-medium mb-2">{example.title}</h3>
          <CopyInput value={example.url} />
        </div>
      ))}
    </div>
    </div>
  );
}