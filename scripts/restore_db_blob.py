import subprocess

blobs_output = subprocess.check_output(['git', 'fsck', '--lost-found'], stderr=subprocess.DEVNULL).decode()
found = False

for line in blobs_output.splitlines():
    if 'dangling blob' in line:
        h = line.split()[2]
        try:
            size = int(subprocess.check_output(['git', 'cat-file', '-s', h]).decode().strip())
            if size > 40000:
                content = subprocess.check_output(['git', 'cat-file', '-p', h]).decode('utf-8', errors='ignore')
                if 'getOrganizationAnalytics' in content and 'organization_memberships' in content:
                    print(f"Found match: {h}, size: {size}, lines: {len(content.splitlines())}")
                    with open('src/lib/db/database.ts', 'w', encoding='utf-8') as f:
                        f.write(content)
                    print("Restored src/lib/db/database.ts successfully!")
                    found = True
                    break
        except Exception as e:
            continue

if not found:
    print("No matching blob found.")
