import os, glob

updated_files = 0
for f in glob.glob('src/server/**/*.py', recursive=True):
    try:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        new_content = content.replace('src.web.server', 'src.server.server').replace('src.web.web_server', 'src.server.web_server')
        if content != new_content:
            with open(f, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print(f"Updated {f}")
            updated_files += 1
    except Exception as e:
        print(f"Error processing {f}: {e}")

print(f"Total files updated: {updated_files}")
