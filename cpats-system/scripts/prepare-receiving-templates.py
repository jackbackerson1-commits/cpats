"""Prepare reusable, sample-free templates from DMC's supplied workbook.
Usage: python scripts/prepare-receiving-templates.py <source.xlsx>
Preserve the worksheet's original layout; remove other sheets and sample data.
"""
import sys, zipfile, re, html, pathlib, xml.etree.ElementTree as E

root = pathlib.Path(__file__).resolve().parents[1] / 'src/templates/receiving'
root.mkdir(parents=True, exist_ok=True)
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as source:
    strings = [''.join(node.itertext()) for node in E.fromstring(source.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    for kind, sheet in [('RR', 1), ('MR', 5)]:
        clear = set()
        if kind == 'RR':
            for offset in [0, 34]:
                clear.update(f'{col}{row+offset}' for row in range(14, 29) for col in 'ABCDEFG')
                clear.update(f'{col}{row+offset}' for col,row in [('C',7),('C',8),('C',9),('F',7),('F',8),('F',9),('G',9),('A',31),('C',31),('D',31)])
            clear.update(['H1','K11'])
        else:
            for offset in [0, 35]:
                clear.update(f'{col}{row+offset}' for row in range(16, 25) for col in 'ABCDEFGHI')
                clear.update(f'H{row+offset}' for row in [7,8,9,10])
            clear.update(['A13','A48','B30','G30','B33','B34','G33','B64','G64','B67','B68','G67'])
        xml = source.read(f'xl/worksheets/sheet{sheet}.xml').decode()
        def cell(match):
            attrs, body = match.group(1), match.group(2) or ''
            address = re.search(r'\br="([A-Z]+\d+)"', attrs).group(1)
            if address in clear: return '<c'+re.sub(r'\s+t="[^"]*"','',attrs)+'/>'
            if 't="s"' in attrs:
                value = re.search(r'<v>(\d+)</v>', body)
                body = '<is><t xml:space="preserve">'+html.escape(strings[int(value.group(1))])+'</t></is>'
                attrs = attrs.replace('t="s"','t="inlineStr"')
            return '<c'+attrs+'>'+body+'</c>'
        xml = re.sub(r'<c\b([^>]*?)(?:/>|>(.*?)</c>)', cell, xml, flags=re.S)
        xml = re.sub(r' r:id="[^"]*"','',xml)
        xml = re.sub(r'<(?:drawing|legacyDrawing)\b[^>]*/>','',xml)
        area = '$A$1:$G$66' if kind == 'RR' else '$A$1:$I$68'
        workbook = f'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="{ns["m"]}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="{kind}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'{kind}\'!{area}</definedName></definedNames></workbook>'
        rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>'
        types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'
        with zipfile.ZipFile(root / f'{kind}.xlsx','w',zipfile.ZIP_DEFLATED) as output:
            for name in ['xl/styles.xml','xl/theme/theme1.xml']: output.writestr(name,source.read(name))
            output.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
            output.writestr('[Content_Types].xml',types)
            output.writestr('xl/workbook.xml',workbook)
            output.writestr('xl/_rels/workbook.xml.rels',rels)
            output.writestr('xl/worksheets/sheet1.xml',xml)
        print(kind, 'template prepared')
