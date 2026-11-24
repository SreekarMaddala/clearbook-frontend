"""Apply app-client-scoped Cognito classic branding after saving the previous theme.

Requires the operator's local boto3/AWS credentials. Does not change auth flows,
the pool tier, users, passwords, clients, domains or callback URLs.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
POOL = 'ap-south-2_vy4GCYTNM'
CLIENT = 'qf45j6u4nn5keh80oo07kbr91'


def main():
    import boto3
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    css = (ROOT / 'auth-branding/cognito.css').read_text(encoding='utf-8')
    image = (ROOT / 'auth-branding/header.jpg').read_bytes()
    if len(css.encode()) > 3000 or len(image) > 100000:
        raise ValueError('Branding exceeds the Cognito classic asset size limits.')
    print(json.dumps({'pool': POOL, 'client': CLIENT, 'css_bytes': len(css.encode()),
                      'image_bytes': len(image), 'apply': args.apply}, indent=2))
    if not args.apply:
        return
    session = boto3.Session(region_name='ap-south-2')
    if session.client('sts').get_caller_identity()['Account'] != '337023347522':
        raise ValueError('Unexpected AWS account.')
    client = session.client('cognito-idp')
    before = client.get_ui_customization(UserPoolId=POOL, ClientId=CLIENT)['UICustomization']
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
    output = ROOT / '.local' / 'auth-branding' / stamp
    output.mkdir(parents=True)
    (output / 'before.json').write_text(json.dumps(before, indent=2, default=str), encoding='utf-8')
    (output / 'before.css').write_text(before.get('CSS', ''), encoding='utf-8')
    if before.get('ImageUrl'):
        with urlopen(before['ImageUrl'], timeout=25) as response:
            (output / 'before-image').write_bytes(response.read())
    result = client.set_ui_customization(UserPoolId=POOL, ClientId=CLIENT, CSS=css, ImageFile=image)['UICustomization']
    saved = client.get_ui_customization(UserPoolId=POOL, ClientId=CLIENT)['UICustomization']
    if saved.get('CSS') != css or not saved.get('ImageUrl'):
        raise RuntimeError('Branding verification failed; inspect the saved theme backup.')
    receipt = {'pool': POOL, 'client': CLIENT, 'css_version': result.get('CSSVersion'),
               'css_sha256': hashlib.sha256(css.encode()).hexdigest(),
               'image_sha256': hashlib.sha256(image).hexdigest(), 'backup_directory': str(output),
               'image_url': saved['ImageUrl'], 'verified': True}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('Applied and verified app-client branding. Backup and receipt: ' + str(output))


if __name__ == '__main__':
    main()
