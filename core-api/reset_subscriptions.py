"""
Reset all push notification subscriptions (Calendar and Gmail watches)

This script:
1. Lists all active push subscriptions
2. Attempts to stop them with Google
3. Marks them as inactive in the database
4. Clears webhook URLs that may be pointing to old domains

Usage:
    python reset_subscriptions.py

After running this, users should:
1. Log out and log back in
2. The ensure-watches endpoint will create new subscriptions with correct URLs
"""
import os
import sys
from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.supabase_client import get_service_role_client
from api.config import settings

def reset_subscriptions():
    """Reset all push notification subscriptions"""
    
    print("=" * 80)
    print("🔧 Reset Push Notification Subscriptions")
    print("=" * 80)
    print()
    print(f"📋 Current webhook base URL: {settings.webhook_base_url}")
    print()
    
    # Get service role client (bypasses RLS)
    supabase = get_service_role_client()
    
    # Get all active subscriptions
    print("🔍 Fetching active subscriptions...")
    result = supabase.table('push_subscriptions')\
        .select('*, ext_connections!push_subscriptions_ext_connection_id_fkey(user_id, access_token, refresh_token, provider)')\
        .eq('is_active', True)\
        .execute()
    
    subscriptions = result.data
    print(f"📊 Found {len(subscriptions)} active subscription(s)")
    print()
    
    if not subscriptions:
        print("✅ No active subscriptions to reset")
        return
    
    # Process each subscription
    for i, sub in enumerate(subscriptions, 1):
        provider = sub['provider']
        user_id = sub['ext_connections']['user_id']
        channel_id = sub.get('channel_id')
        resource_id = sub.get('resource_id')
        expiration = sub.get('expiration')
        notification_count = sub.get('notification_count', 0)
        
        # Get webhook URL from metadata if available
        old_webhook_url = sub.get('metadata', {}).get('webhook_url', 'unknown')
        
        print(f"[{i}/{len(subscriptions)}] {provider.upper()} subscription")
        print(f"   User ID: {user_id[:8]}...")
        print(f"   Channel ID: {channel_id}")
        print(f"   Resource ID: {resource_id}")
        print(f"   Expiration: {expiration}")
        print(f"   Notifications received: {notification_count}")
        print(f"   Old webhook URL: {old_webhook_url}")
        print()
        
        # Try to stop the watch with Google
        try:
            access_token = sub['ext_connections']['access_token']
            refresh_token = sub['ext_connections']['refresh_token']
            
            if access_token and refresh_token:
                credentials = Credentials(
                    token=access_token,
                    refresh_token=refresh_token,
                    token_uri='https://oauth2.googleapis.com/token',
                    client_id=settings.google_client_id,
                    client_secret=settings.google_client_secret
                )
                
                if provider == 'gmail':
                    # Stop Gmail watch
                    try:
                        service = build('gmail', 'v1', credentials=credentials)
                        service.users().stop(userId='me').execute()
                        print(f"   ✅ Stopped Gmail watch with Google")
                    except HttpError as e:
                        if e.resp.status == 404:
                            print(f"   ⚠️  Gmail watch not found (already expired)")
                        else:
                            print(f"   ⚠️  Could not stop Gmail watch: {e}")
                    except Exception as e:
                        print(f"   ⚠️  Error stopping Gmail watch: {e}")
                
                elif provider == 'calendar' and channel_id and resource_id:
                    # Stop Calendar watch
                    try:
                        service = build('calendar', 'v3', credentials=credentials)
                        service.channels().stop(body={
                            'id': channel_id,
                            'resourceId': resource_id
                        }).execute()
                        print(f"   ✅ Stopped Calendar watch with Google")
                    except HttpError as e:
                        if e.resp.status == 404:
                            print(f"   ⚠️  Calendar watch not found (already expired)")
                        else:
                            print(f"   ⚠️  Could not stop Calendar watch: {e}")
                    except Exception as e:
                        print(f"   ⚠️  Error stopping Calendar watch: {e}")
            else:
                print(f"   ⚠️  No tokens available, cannot stop with Google")
        
        except Exception as e:
            print(f"   ⚠️  Error processing subscription: {e}")
        
        # Mark as inactive in database
        try:
            supabase.table('push_subscriptions')\
                .update({
                    'is_active': False,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })\
                .eq('id', sub['id'])\
                .execute()
            print(f"   ✅ Marked as inactive in database")
        except Exception as e:
            print(f"   ❌ Failed to update database: {e}")
        
        print()
    
    print("=" * 80)
    print("✅ Subscription reset complete!")
    print()
    print("📋 Next Steps:")
    print("   1. Users should log out and log back in")
    print("   2. Or manually trigger: POST /api/sync/ensure-watches")
    print("   3. New watches will be created with current webhook URL:")
    print(f"      Gmail:    {settings.webhook_base_url}/api/webhooks/gmail")
    print(f"      Calendar: {settings.webhook_base_url}/api/webhooks/calendar")
    print()
    print("💡 Tip: Check Vercel logs after creating an event to verify webhook is hit")
    print("=" * 80)


if __name__ == "__main__":
    # Check if required settings are configured
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("❌ ERROR: Missing required environment variables")
        print("   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    if not settings.google_client_id or not settings.google_client_secret:
        print("❌ ERROR: Missing Google OAuth credentials")
        print("   Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET")
        sys.exit(1)
    
    try:
        reset_subscriptions()
    except KeyboardInterrupt:
        print("\n\n⚠️  Script interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

