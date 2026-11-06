#!/usr/bin/env python3
"""Strip metadata from every PNG, JPG, SVG and PDF in the repository.

Dev-only tool, never loaded by the site. Run from anywhere inside the repo:

    python tools/strip-metadata.py --dry-run     # list what each file carries, change nothing
    python tools/strip-metadata.py               # strip, then verify
    python tools/strip-metadata.py path1 path2   # only these files or folders

Needs Python 3.8+, exiftool (PNG, JPG, PDF) and qpdf (PDF).
  Windows: winget install OliverBetz.ExifTool  and  winget install qpdf.qpdf
  macOS:   brew install exiftool qpdf
  Linux:   sudo apt install libimage-exiftool-perl qpdf

What it does, and what it keeps:
  PNG   exiftool -all=. Pixel data is untouched. Colour chunks (sRGB, gamma, chromaticities, ICC profile)
        are kept so colours do not shift.
  JPG   exiftool -all= plus trailer removal. Pixel data is untouched (no re-encode). ICC profile and the
        EXIF Orientation flag are kept so the picture is not shown rotated or colour shifted.
  SVG   Removes comments, <metadata>, Inkscape/Sodipodi/Illustrator editor data and unused editor
        namespaces. Anything that would change rendering is left alone. <title> and <desc> are reported,
        not removed, because they are accessibility text.
  PDF   exiftool -all= only appends an update that hides the old Info and XMP, so the old values stay in
        the file. This rewrites the file with qpdf afterwards, which drops the hidden objects.

Safety: needs a clean git tree (git is the backup) unless --dry-run or --no-git-check is given.
Metadata already committed stays in git history. This script does not rewrite history.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.dom.minidom
from pathlib import Path

EXTENSIONS = {".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".svg": "svg", ".pdf": "pdf"}
SKIP_DIRS = {".git", "node_modules"}

# exiftool groups that describe the file system or exiftool itself, not the file's contents.
IGNORED_GROUPS = {"System", "File", "ExifTool", "Composite"}
# Tags that describe the picture or document structure. Not metadata about people, tools or places.
STRUCTURAL = {
    "ImageWidth", "ImageHeight", "BitDepth", "ColorType", "Compression", "Filter", "Interlace",
    "BitsPerSample", "ColorComponents", "EncodingProcess", "YCbCrSubSampling", "YCbCrPositioning",
    "JFIFVersion", "ResolutionUnit", "XResolution", "YResolution",
    "PDFVersion", "Linearized", "PageCount", "TaggedPDF", "PageMode", "Language",
    "Xmlns", "ViewBox",
}
# Tags deliberately kept so the image still renders the same.
KEPT = {"SRGBRendering", "Gamma", "PrimaryChromaticities", "WhitePoint", "Orientation"}
KEPT_GROUPS = {"ICC_Profile"}

# Strings that must not appear in a stripped PDF's raw bytes.
PDF_RAW_MARKERS = [
    b"/Author", b"/Creator", b"/Producer", b"/CreationDate", b"/ModDate", b"/Title", b"/Subject",
    b"/Keywords", b"/Metadata", b"<x:xmpmeta",
]
EDITOR_NAMESPACES = ("sodipodi", "inkscape", "dc", "cc", "rdf", "serif", "i", "x", "xap", "ns1", "ns2")

TAG_LINE = re.compile(r"^\[(?P<group>[^\]]+)\]\s+(?P<name>\S+)\s*:")


class Tools:
    exiftool = shutil.which("exiftool")
    qpdf = shutil.which("qpdf")


def run(command, check=True):
    return subprocess.run(command, capture_output=True, text=True, check=check)


def repo_root():
    result = run(["git", "rev-parse", "--show-toplevel"], check=False)
    return Path(result.stdout.strip()) if result.returncode == 0 else None


def git_is_clean(root):
    return run(["git", "-C", str(root), "status", "--porcelain"]).stdout.strip() == ""


def find_files(targets):
    found = []
    for target in targets:
        if target.is_file():
            if target.suffix.lower() in EXTENSIONS:
                found.append(target)
            continue
        for folder, dirs, names in os.walk(target):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for name in names:
                path = Path(folder) / name
                if path.suffix.lower() in EXTENSIONS:
                    found.append(path)
    return sorted(set(found))


def read_tags(path, include_kept=False):
    """Metadata tags exiftool sees, as 'Group:Name'. Structural and deliberately kept tags are left out."""
    output = run([Tools.exiftool, "-a", "-G1", "-s", str(path)]).stdout
    tags = []
    for line in output.splitlines():
        match = TAG_LINE.match(line)
        if not match:
            continue
        group, name = match.group("group"), match.group("name")
        if group in IGNORED_GROUPS or name in STRUCTURAL:
            continue
        if not include_kept and (name in KEPT or group in KEPT_GROUPS):
            continue
        tags.append(f"{group}:{name}")
    return tags


# ---------- PNG and JPG ----------

def strip_png(path):
    run([
        Tools.exiftool, "-q", "-q", "-overwrite_original", "-all=",
        "-tagsfromfile", "@", "-PNG:SRGBRendering", "-PNG:Gamma", "-PNG:PrimaryChromaticities",
        "-PNG:WhitePoint", "-ICC_Profile", str(path),
    ])


def strip_jpg(path):
    run([
        Tools.exiftool, "-q", "-q", "-overwrite_original", "-all=", "-Trailer:All=",
        "-tagsfromfile", "@", "-ICC_Profile", "-Orientation", str(path),
    ])


# ---------- SVG ----------

def strip_svg_text(text):
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<metadata\b[^>]*?/>", "", text, flags=re.S)
    text = re.sub(r"<metadata\b.*?</metadata>", "", text, flags=re.S)
    text = re.sub(r"<sodipodi:namedview\b[^>]*?/>", "", text, flags=re.S)
    text = re.sub(r"<sodipodi:namedview\b.*?</sodipodi:namedview>", "", text, flags=re.S)
    text = re.sub(r'\s(?:sodipodi|inkscape|serif):[\w.-]+\s*=\s*("[^"]*"|\'[^\']*\')', "", text)
    for prefix in EDITOR_NAMESPACES:
        declaration = rf'\sxmlns:{prefix}\s*=\s*("[^"]*"|\'[^\']*\')'
        without = re.sub(declaration, "", text)
        if not re.search(rf"[\s<]{prefix}:[\w.-]+", without):  # only drop it when nothing still uses it
            text = without
    return re.sub(r"\n[ \t]*(?=\n)", "", text)  # drop the blank lines left where content was removed


def strip_svg(path):
    original = path.read_text(encoding="utf-8")
    cleaned = strip_svg_text(original)
    xml.dom.minidom.parseString(cleaned.encode("utf-8"))  # raises if the result is not valid XML
    if cleaned != original:
        path.write_text(cleaned, encoding="utf-8")


def svg_leftovers(path):
    text = path.read_text(encoding="utf-8")
    found = []
    if re.search(r"<!--", text):
        found.append("comment")
    if re.search(r"<metadata\b", text):
        found.append("<metadata>")
    if re.search(r"\b(?:sodipodi|inkscape|serif):", text):
        found.append("editor attribute")
    return found


def svg_notes(path):
    text = path.read_text(encoding="utf-8")
    return [f"<{tag}> kept (accessibility text)" for tag in ("title", "desc") if re.search(rf"<{tag}\b", text)]


# ---------- PDF ----------

def strip_pdf(path):
    run([Tools.exiftool, "-q", "-q", "-overwrite_original", "-all=", str(path)])
    rewritten = Path(tempfile.mkdtemp()) / path.name
    result = run([Tools.qpdf, "--object-streams=disable", str(path), str(rewritten)], check=False)
    if result.returncode not in (0, 3):  # 3 means "finished with warnings"
        raise RuntimeError(f"qpdf failed: {result.stderr.strip()}")
    shutil.move(str(rewritten), str(path))


def pdf_leftovers(path):
    data = path.read_bytes()
    return [marker.decode() for marker in PDF_RAW_MARKERS if marker in data]


# ---------- driver ----------

STRIPPERS = {"png": strip_png, "jpg": strip_jpg, "svg": strip_svg, "pdf": strip_pdf}


def describe(path, kind):
    """Everything identifying the file still carries. Used for the 'before' report and the verify pass."""
    if kind == "svg":
        return svg_leftovers(path)
    found = read_tags(path)
    if kind == "pdf":
        found += [f"raw {marker}" for marker in pdf_leftovers(path)]
    return found


def main():
    parser = argparse.ArgumentParser(description="Strip metadata from PNG, JPG, SVG and PDF files.")
    parser.add_argument("paths", nargs="*", help="files or folders (default: the whole repo)")
    parser.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    parser.add_argument("--no-git-check", action="store_true", help="skip the clean-tree requirement")
    args = parser.parse_args()

    root = repo_root()
    targets = [Path(p).resolve() for p in args.paths] or [root or Path(__file__).resolve().parent.parent]
    files = find_files(targets)
    if not files:
        print("No PNG, JPG, SVG or PDF files found.")
        return 0

    kinds = {EXTENSIONS[f.suffix.lower()] for f in files}
    if kinds & {"png", "jpg", "pdf"} and not Tools.exiftool:
        sys.exit("exiftool not found. See the install lines at the top of this file.")
    if "pdf" in kinds and not Tools.qpdf:
        sys.exit("qpdf not found (needed for PDFs). See the install lines at the top of this file.")

    if not args.dry_run and not args.no_git_check:
        if root is None:
            sys.exit("Not inside a git repo, so there is no backup. Re-run with --no-git-check if that is fine.")
        if not git_is_clean(root):
            sys.exit("Git tree has uncommitted changes. Commit or stash them first so this run can be reverted.")

    print(f"{'DRY RUN: ' if args.dry_run else ''}{len(files)} file(s)\n")
    failures = 0
    for path in files:
        kind = EXTENSIONS[path.suffix.lower()]
        shown = path.relative_to(root) if root and root in path.parents else path
        size_before = path.stat().st_size
        before = describe(path, kind)
        if args.dry_run:
            print(f"{shown}: {len(before)} metadata item(s) {before if before else ''}")
            continue
        try:
            STRIPPERS[kind](path)
        except Exception as error:  # report and keep going so one bad file does not hide the rest
            failures += 1
            print(f"FAIL  {shown}: {error}")
            continue
        remaining = describe(path, kind)
        status = "ok  " if not remaining else "LEFT"
        failures += bool(remaining)
        print(f"{status}  {shown}: {len(before)} -> {len(remaining)} metadata item(s), "
              f"{size_before} -> {path.stat().st_size} bytes" + (f"  remaining: {remaining}" if remaining else ""))
        for note in svg_notes(path) if kind == "svg" else []:
            print(f"      note: {note}")

    print("\nVerified clean." if not failures and not args.dry_run else "")
    if failures:
        print(f"{failures} file(s) failed or still carry metadata.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
