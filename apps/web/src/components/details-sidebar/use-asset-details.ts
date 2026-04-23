"use client"

import { useState, useEffect } from "react"
import { useQueryState, parseAsString } from "nuqs"
import { useQueryClient } from "@tanstack/react-query"
import { useStorageTree } from "@/hooks/use-storage-tree"
import { usePreloadMedia } from "@/hooks/use-preload-media"
import { findAssetInTree } from "./utils"
import type { MediaFile } from "./types"

export function useAssetDetails(onOpenChange?: (open: boolean) => void) {
  const [assetId, setAssetId] = useQueryState(
    "asset",
    parseAsString.withOptions({ clearOnDefault: true })
  )
  const { data: treeData, isLoading: treeLoading } = useStorageTree()
  const queryClient = useQueryClient()
  const [asset, setAsset] = useState<MediaFile | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [optimizedSize, setOptimizedSize] = useState<number | null>(null)
  const [createdAt, setCreatedAt] = useState<Date | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
  const getDownloadUrl = (path: string) =>
    `${apiBaseUrl}/download/${path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`

  const fetchFileMetadata = async (path: string) => {
    try {
      // Encode each segment of the path separately to preserve slashes
      const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      
      const response = await fetch(`${apiBaseUrl}/storage/${encodedPath}/metadata`, {
        method: "GET",
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()

        if (data.size !== undefined) {
          setFileSize(data.size)
        }

        if (data.createdAt) {
          setCreatedAt(new Date(data.createdAt))
        }

        if (data.updatedAt) {
          setUpdatedAt(new Date(data.updatedAt))
        }
      }
    } catch (error) {
      console.error("Failed to fetch file metadata:", error)
    }
  }

  // Find asset when assetId or treeData changes
  useEffect(() => {
    if (assetId && treeData) {
      const foundAsset = findAssetInTree(treeData, assetId)
      setAsset(foundAsset)
      if (foundAsset) {
        onOpenChange?.(true)
      }
    } else {
      setAsset(null)
      if (!assetId) {
        onOpenChange?.(false)
      }
    }
  }, [assetId, treeData, onOpenChange])

  // Fetch metadata when asset changes
  useEffect(() => {
    if (asset) {
      fetchFileMetadata(asset.path)
      setOptimizedSize(null)
    } else {
      setFileSize(null)
      setOptimizedSize(null)
      setCreatedAt(null)
      setUpdatedAt(null)
    }
  }, [asset])

  const mediaUrl = asset ? getDownloadUrl(asset.path) : ""
  const previewUrl = asset
    ? getDownloadUrl(asset.path)
    : ""

  // Preload preview media when asset changes
  // Note: Even videos are preloaded as "image" since we extract thumbnails
  usePreloadMedia(previewUrl, "image")

  const handleCopyUrl = () => {
    if (mediaUrl) {
      navigator.clipboard.writeText(mediaUrl)
    }
  }

  const handleDownload = () => {
    if (!asset) return
    const downloadUrl = `${apiBaseUrl}/download/${asset.path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/")}`
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = asset.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleOpenInNewTab = () => {
    if (mediaUrl) {
      window.open(mediaUrl, "_blank")
    }
  }

  const handleClose = () => {
    setAssetId(null)
    onOpenChange?.(false)
  }

  const handleDelete = async () => {
    if (!asset) return

    const confirmed = window.confirm(
      `Are you sure you want to delete "${asset.name}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setIsDeleting(true)
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ""
      
      // Encode each segment of the path separately to preserve slashes
      // This is necessary for files in subdirectories
      const encodedPath = asset.path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      
      const deleteUrl = `${apiBaseUrl}/storage/${encodedPath}`
      
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        // Try to parse JSON error response, but handle cases where it's not JSON
        let errorMessage = `Failed to delete file (${response.status})`
        try {
          const contentType = response.headers.get("content-type")
          if (contentType && contentType.includes("application/json")) {
            const errorBody = await response.json()
            errorMessage = errorBody.message || errorBody.error || errorMessage
          } else {
            const text = await response.text()
            if (text) {
              errorMessage = text
            }
          }
        } catch (parseError) {
          // If parsing fails, use the default error message
        }
        throw new Error(errorMessage)
      }

      // For successful responses, consume the body to avoid memory leaks
      // We don't need the data, so we can safely ignore parsing errors
      try {
        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
          await response.json()
        } else {
          await response.text()
        }
      } catch (parseError) {
        // Ignore parsing errors for success responses - we don't need the data
      }

      // Refresh the storage tree
      await queryClient.invalidateQueries({ queryKey: ["storage-tree"] })

      // Close the sidebar and clear selection
      setAssetId(null)
      onOpenChange?.(false)
    } catch (error) {
      console.error("Failed to delete file:", error)
      alert(error instanceof Error ? error.message : "Failed to delete file")
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    asset,
    assetId,
    setAssetId,
    treeLoading,
    fileSize,
    optimizedSize,
    createdAt,
    updatedAt,
    isDeleting,
    mediaUrl,
    previewUrl,
    apiBaseUrl,
    handleCopyUrl,
    handleDownload,
    handleOpenInNewTab,
    handleClose,
    handleDelete,
  }
}

