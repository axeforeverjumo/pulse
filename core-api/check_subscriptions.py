"""
Check current push notification subscriptions

This script shows:
- All active subscriptions
- Their webhook URLs
- Expiration dates
- Notification counts

Usage:
    python check_subscriptions.py
"""
import os
import sys
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.supabase_client import get_service_role_client
from api.config import settings

def check_subscriptions():
    """Check all push notification subscriptions"""
    
    print("=" * 80)
    print("📊 Push Notification Subscriptions Status")
    print("=" * 80)
    print()
    print(f"🌐 Current webhook base URL: {settings.webhook_base_url}")
    print(f"📧 Gmail webhook:    {settings.webhook_base_url}/api/webhooks/gmail")
    print(f"📅 Calendar webhook: {settings.webhook_base_url}/api/webhooks/calendar")
    print()
    
    # Get service role client (bypasses RLS)
    supabase = get_service_role_client()
    
    # Get all subscriptions (active and inactive)
    print("🔍 Fetching all subscriptions...")
    result = supabase.table('push_subscriptions')\
        .select('*, ext_connections!push_subscriptions_ext_connection_id_fkey(user_id, provider, is_active)')\
        .order('created_at', desc=True)\
        .execute()
    
    subscriptions = result.data
    print(f"📊 Found {len(subscriptions)} total subscription(s)")
    print()
    
    if not subscriptions:
        print("ℹ️  No subscriptions found")
        print()
        print("💡 To create subscriptions:")
        print("   1. User logs in to the app")
        print("   2. POST /api/sync/ensure-watches is called automatically")
        print("   3. New watches are created with current webhook URLs")
        return
    
    # Group by status
    active = [s for s in subscriptions if s['is_active']]
    inactive = [s for s in subscriptions if not s['is_active']]
    
    # Show active subscriptions
    if active:
        print("✅ ACTIVE SUBSCRIPTIONS:")
        print("-" * 80)
        for sub in active:
            provider = sub['provider']
            user_id = sub['ext_connections']['user_id']
            channel_id = sub.get('channel_id')
            expiration = sub.get('expiration')
            notification_count = sub.get('notification_count', 0)
            last_notification = sub.get('last_notification_at')
            webhook_url = sub.get('metadata', {}).get('webhook_url', 'not stored')
            
            # Calculate time until expiration
            exp_dt = datetime.fromisoformat(expiration.replace('Z', '+00:00'))
            time_until_expiry = exp_dt - datetime.now(timezone.utc)
            hours_left = time_until_expiry.total_seconds() / 3600
            
            print(f"\n🔔 {provider.upper()}")
            print(f"   User ID:         {user_id[:12]}...")
            print(f"   Channel ID:      {channel_id}")
            print(f"   Webhook URL:     {webhook_url}")
            print(f"   Expiration:      {expiration} ({hours_left:.1f} hours remaining)")
            print(f"   Notifications:   {notification_count} received")
            if last_notification:
                print(f"   Last notified:   {last_notification}")
            print(f"   Created:         {sub.get('created_at')}")
        print()
    
    # Show inactive subscriptions
    if inactive:
        print("⚠️  INACTIVE SUBSCRIPTIONS:")
        print("-" * 80)
        for sub in inactive:
            provider = sub['provider']
            user_id = sub['ext_connections']['user_id']
            expiration = sub.get('expiration')
            webhook_url = sub.get('metadata', {}).get('webhook_url', 'not stored')
            
            print(f"\n❌ {provider.upper()}")
            print(f"   User ID:         {user_id[:12]}...")
            print(f"   Webhook URL:     {webhook_url}")
            print(f"   Was active until: {expiration}")
            print(f"   Created:         {sub.get('created_at')}")
        print()
    
    # Summary
    print("=" * 80)
    print("📈 SUMMARY:")
    print(f"   Active subscriptions:   {len(active)}")
    print(f"   Inactive subscriptions: {len(inactive)}")
    print(f"   Total:                  {len(subscriptions)}")
    print()
    
    # Check for URL mismatches
    mismatched = []
    expected_urls = {
        'gmail': f"{settings.webhook_base_url}/api/webhooks/gmail",
        'calendar': f"{settings.webhook_base_url}/api/webhooks/calendar"
    }
    
    for sub in active:
        provider = sub['provider']
        stored_url = sub.get('metadata', {}).get('webhook_url', '')
        expected_url = expected_urls.get(provider, '')
        
        if stored_url and stored_url != expected_url:
            mismatched.append({
                'provider': provider,
                'stored': stored_url,
                'expected': expected_url
            })
    
    if mismatched:
        print("⚠️  WARNING: Webhook URL mismatches detected!")
        print()
        for m in mismatched:
            print(f"   {m['provider'].upper()}:")
            print(f"      Stored:   {m['stored']}")
            print(f"      Expected: {m['expected']}")
        print()
        print("💡 To fix: Run 'python reset_subscriptions.py'")
    else:
        print("✅ All webhook URLs match current configuration")
    
    print("=" * 80)


if __name__ == "__main__":
    # Check if required settings are configured
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("❌ ERROR: Missing required environment variables")
        print("   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    try:
        check_subscriptions()
    except KeyboardInterrupt:
        print("\n\n⚠️  Script interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

