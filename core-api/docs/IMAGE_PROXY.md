# Image Proxy Architecture

Images are served through a Cloudflare Worker (`core-image-proxy`) that sits in front of the private R2 bucket. This provides:
- HMAC-signed URLs (prevents unauthorized access)
- On-the-fly image resizing
- CDN caching at 300+ edge locations

## URL Flow

```
Upload:
1. Frontend → POST /api/files/upload-url (get presigned PUT URL)
2. Frontend → PUT to R2 directly (bypasses backend)
3. Frontend → POST /api/files/{id}/confirm
4. Backend returns public_url (proxy URL for images, R2 URL for others)

Serving:
Browser → Cloudflare Worker → R2 bucket → resized image
           (validates HMAC)    (private)
```

## Environment Variables

Both `core-api` and `core-image-proxy` need the same secret:

```bash
# In core-api (Vercel)
IMAGE_PROXY_URL=https://img.yourdomain.com
IMAGE_PROXY_SECRET=<shared-secret>

# In core-image-proxy (Cloudflare Worker)
# Set via: wrangler secret put IMAGE_PROXY_SECRET
```

## URL Format

```
https://img.yourdomain.com/files/user-xxx/20260205/abc.jpg?w=384&q=75&f=webp&exp=1738836000&sig=abc123
```

| Param | Description |
|-------|-------------|
| `w`   | Width in pixels (0 = original) |
| `q`   | Quality 1-100 |
| `f`   | Format: `webp`, `avif`, `auto` |
| `exp` | Expiration timestamp (day-window rounded) |
| `sig` | HMAC-SHA256 signature (first 32 chars) |

Signed URLs are deterministic within a day and valid for 7 days.

## Size Variants

| Variant   | Width  | Quality | Use Case |
|-----------|--------|---------|----------|
| `thumb`   | 384px  | 75      | Thumbnails, workspace icons |
| `chat`    | 768px  | 82      | Inline chat images |
| `preview` | 1200px | 85      | Card previews, modals |
| `full`    | original | 100   | Full resolution |

## Code References

- URL generation: `lib/image_proxy.py`
- Presigned uploads: `lib/presigned_upload.py`
- Worker code: `../core-image-proxy/src/index.ts`

## Fallback Behavior

If `IMAGE_PROXY_URL` or `IMAGE_PROXY_SECRET` are not configured:
- Images fall back to direct R2 public URLs (requires `R2_PUBLIC_URL`)
- Non-images always use direct R2 URLs
