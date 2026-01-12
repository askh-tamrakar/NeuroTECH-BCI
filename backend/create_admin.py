import os
import django
from django.contrib.auth import get_user_model

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

User = get_user_model()
USERNAME = 'admin'
PASSWORD = 'admin123'
EMAIL = 'admin@example.com'

def create_superuser():
    print(f"Checking for user '{USERNAME}'...")
    if not User.objects.filter(username=USERNAME).exists():
        print(f"Creating superuser '{USERNAME}'...")
        try:
            User.objects.create_superuser(USERNAME, EMAIL, PASSWORD)
            print(f"✅ Superuser created successfully.")
            print(f"Username: {USERNAME}")
            print(f"Password: {PASSWORD}")
        except Exception as e:
            print(f"❌ Error creating superuser: {e}")
    else:
        print(f"User '{USERNAME}' already exists.")
        # Optional: Reset password?
        # u = User.objects.get(username=USERNAME)
        # u.set_password(PASSWORD)
        # u.save()
        # print("Password reset to default.")

if __name__ == "__main__":
    create_superuser()
