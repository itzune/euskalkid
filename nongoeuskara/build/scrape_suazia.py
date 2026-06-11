#!/usr/bin/env python3
"""
Scrape Zuberotarra text content from SÜ AZIA (www.suazia.com) via Wayback Machine.

Extracts:
  1. Pastoral full texts (Antso Handia, etc.)
  2. All blog/news articles from listing pages
  3. Static content pages

Output: clean zuberera-labeled sentences for fastText training.
"""

import re
import json
import subprocess
import time
from pathlib import Path
from collections import Counter

HERE = Path(__file__).parent
OUT_DIR = Path("/home/xezpeleta/Dev/itzune/zeineuski/data/raw/text/suazia")
OUT_DIR.mkdir(parents=True, exist_ok=True)

WAYBACK_BASE = "https://web.archive.org/web"
CAPTURE = "20110920103304"

# ── URLs to scrape ──────────────────────────────────────────────────────

STATIC_PAGES = [
    # Pastoral full texts (the money pages!)
    ("Antso Handia (2004)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=57&Itemid=63&lang=eu"),
    ("Bereterretx (2005)",  f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=61&Itemid=67&lang=eu"),
    ("Santa Engrazi (2006)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=62&Itemid=66&lang=eu"),
    ("Eñaut Elizagarai (2007)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=63&Itemid=64&lang=eu"),
    ("Xiberoko Jauna (2008)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=65&Itemid=65&lang=eu"),
    ("Belagileen Trajeria (2009)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=66&Itemid=68&lang=eu"),
    ("Xahakoa (2010)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=67&Itemid=69&lang=eu"),
    # Later pastorals
    ("Telesforo Monzon (2011)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=78&catid=1&lang=eu"),
    # Association & info pages
    ("Sü Azia elkartea", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=54&Itemid=54&lang=eu"),
    ("Pastoralak Xiberoan (historique)", f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?option=com_content&view=article&id=60&Itemid=61&lang=eu"),
]

BLOG_LISTING_URLS = [
    f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?Hizkuntza:Xiberotarra",
    f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?limitstart=5&lang=eu",
    f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?limitstart=10&lang=eu",
    f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?limitstart=15&lang=eu",
    f"{WAYBACK_BASE}/{CAPTURE}/http://www.suazia.com/index.php?limitstart=20&lang=eu",
]


def fetch(url, timeout=30):
    """Fetch URL using curl (handles rate limiting better)."""
    try:
        result = subprocess.run(
            ["curl", "-sL", "--compressed", "--max-time", str(timeout), "-o", "/tmp/suazia_page.html", url],
            capture_output=True, text=True, timeout=timeout + 5
        )
        if result.returncode != 0:
            print(f"    curl error (code {result.returncode})")
            return ""
        html = Path("/tmp/suazia_page.html").read_text(encoding="utf-8", errors="replace")
        return html
    except Exception as e:
        print(f"    ERROR: {e}")
        return ""


def clean_html(html):
    """Strip HTML tags and wayback toolbar, return clean text."""
    # Remove wayback toolbar
    html = re.sub(r'<div id="wm-ipp-base".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!-- BEGIN WAYBACK.*?<!-- END WAYBACK TOOLBAR INSERT -->', '', html, flags=re.DOTALL)
    
    # Remove scripts, styles, comments
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
    html = re.sub(r'<noscript[^>]*>.*?</noscript>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)
    
    # Preserve paragraph/line breaks
    html = re.sub(r'<br\s*/?>', '\n', html)
    html = re.sub(r'</?p[^>]*>', '\n', html)
    html = re.sub(r'</?div[^>]*>', '\n', html)
    html = re.sub(r'</?(td|tr|table|li)[^>]*>', '\n', html)
    
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', html)
    
    # Decode entities
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&laquo;', '«', text)
    text = re.sub(r'&raquo;', '»', text)
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x10000 else '', text)
    
    return text


def clean_html_str(s, preserve_newlines=False):
    """Decode HTML entities in a string."""
    s = re.sub(r'&amp;', '&', s)
    s = re.sub(r'&nbsp;', ' ', s)
    s = re.sub(r'&gt;', '>', s)
    s = re.sub(r'&lt;', '<', s)
    s = re.sub(r'&quot;', '"', s)
    s = re.sub(r'&laquo;', '«', s)
    s = re.sub(r'&raquo;', '»', s)
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x10000 else '', s)
    if preserve_newlines:
        return s
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def extract_blog_articles(html):
    """Extract article blocks from Joomla blog listing page."""
    # Remove wayback toolbar
    html = re.sub(r'<div id="wm-ipp-base".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!-- BEGIN WAYBACK.*?<!-- END WAYBACK TOOLBAR INSERT -->', '', html, flags=re.DOTALL)
    
    articles = []
    
    # Find all contentheading titles
    title_matches = list(re.finditer(
        r'class="contentheading"[^>]*>\s*(.*?)\s*</',
        html, re.DOTALL
    ))
    
    for i, tm in enumerate(title_matches):
        title = re.sub(r'<[^>]+>', '', tm.group(1)).strip()
        # Also decode entities in title
        title = clean_html_str(title, preserve_newlines=False)
        
        # Get text after this title until next title
        start = tm.end()
        if i + 1 < len(title_matches):
            end = title_matches[i + 1].start()
        else:
            end = len(html)
        
        chunk = html[start:end]
        
        # Extract date
        date_match = re.search(r'class="createdate"[^>]*>\s*(.*?)\s*</', chunk, re.DOTALL)
        date = ""
        if date_match:
            date = clean_html_str(re.sub(r'<[^>]+>', '', date_match.group(1)).strip())
        
        # Clean the chunk
        text = re.sub(r'<script[^>]*>.*?</script>', '', chunk, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<br\s*/?>', '\n', text)
        text = re.sub(r'</?p[^>]*>', '\n', text)
        text = re.sub(r'</?div[^>]*>', '\n', text)
        text = re.sub(r'</?(td|tr|table)[^>]*>', '\n', text)
        text = re.sub(r'<[^>]+>', '', text)
        text = clean_html_str(text, preserve_newlines=True)
        
        # Clean up: remove leftover td markers and collapse whitespace per line
        text = re.sub(r'^\s*td\s*>\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n\s*\n', '\n', text)
        
        # Filter lines
        lines = []
        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue
            low = line.lower()
            if any(s in low for s in [
                'gehiago irakurri', 'artikülü haboro', 'nor ari zaikü so',
                'oraikoan', 'copyright', 'joomla', 'gnu/gpl',
                'bisitazale', 'hatsarrea', 'gibel arrajin',
                'aitzina joan', 'ürrent ü', 'jpage_current',
                'feed entries', 'nork egina',
            ]):
                continue
            if len(line) < 15:
                continue
            lines.append(line)
        
        clean_text = '\n'.join(lines)
        
        if clean_text and len(clean_text) > 30:
            articles.append({
                "title": title,
                "date": date,
                "text": clean_text,
                "source": "blog"
            })
    
    return articles


def extract_full_page_text(html, name="unknown"):
    """Extract all text from a full article/static page, removing HTML chrome."""
    # Remove wayback toolbar
    html = re.sub(r'<div id="wm-ipp-base".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!-- BEGIN WAYBACK.*?<!-- END WAYBACK TOOLBAR INSERT -->', '', html, flags=re.DOTALL)
    
    # Remove scripts, styles
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
    html = re.sub(r'<noscript[^>]*>.*?</noscript>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)
    
    # Preserve breaks
    html = re.sub(r'<br\s*/?>', '\n', html)
    html = re.sub(r'</?p[^>]*>', '\n', html)
    html = re.sub(r'</?div[^>]*>', '\n', html)
    html = re.sub(r'</?(td|tr|table|li)[^>]*>', '\n', html)
    
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', html)
    text = clean_html_str(text, preserve_newlines=True)
    
    # Minimal filtering: only remove obvious non-content, let filter_zuberotarra do the rest
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        if not line or len(line) < 3:
            continue
        low = line.lower()
        # Only skip truly non-content (Wayback, copyright, etc.)
        if any(s in low for s in [
            'copyright', 'joomla', 'gnu/gpl', 'wayback machine',
            'internet archive', 'fight for the future',
            'please don\'t scroll', 'can you chip in',
            'please enter a valid',
        ]):
            continue
        lines.append(line)
    
    return '\n'.join(lines)


def filter_zuberotarra(text):
    """Keep only lines that look like Zuberotarra/Basque text content."""
    lines = text.split('\n')
    result = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if len(line) < 20:
            continue
        
        low = line.lower()
        
        # Skip pastoral structural markers (verse headers, scene titles, etc.)
        if re.match(r'^[\dIVXL]+\.?\s*(jelkaldia|perediküa|kanta)', low):
            continue
        if re.match(r'^\d+\s*-\s*$', line):
            continue
        if low in ('lehen perediküa', 'azken perediküa', 'sataneria', 'la jota',
                    'antso handia (textua)', 'gure argitalpenak'):
            continue
        
        # Skip navigation lines
        if any(line == nav for nav in [
            'Hatsarrea  Antso Handia (2004)', 'Hatsarrea',
            'Lehen holla', 'Alkartea', 'Sü Azia goitigia',
            'Xiberotarraren ortografia', 'Pastorala',
            'Jitekoak diren pastoralak', 'Pastoralak Xiberoan',
            'Pastoralen testuak', 'Gure argitalpenak',
        ]):
            continue
        if low in ('hatsarrea', 'lehen holla', 'alkartea',
                    'sü azia goitigia', 'xiberotarraren ortografia'):
            continue
        
        # Count Basque-script characters
        basque_chars = len([c for c in line.lower() if c in 'aáeéiíoóuúübcdfghjklmnñprstxyz'])
        total_alpha = len([c for c in line.lower() if c.isalpha()])
        if total_alpha == 0:
            continue
        ratio = basque_chars / total_alpha
        if ratio < 0.4:
            continue
        # Skip pure numbers/dates
        if re.match(r'^\d{4}[./-]', line):
            continue
        if re.match(r'^\d+[:.]', line):
            continue
        # Skip lines that are mostly French
        if 'ç' in line and 'ü' not in line:
            continue
        # Skip pastoral year labels in parens
        if re.match(r'^[A-Z].*\(\d{4}\)$', line):
            continue
        result.append(line)
    return '\n'.join(result)


def sentences_from_text(text):
    """Split text into training sentences."""
    sentences = []
    for line in text.split('\n'):
        line = line.strip()
        if not line or len(line) < 15:
            continue
        # Split on major sentence boundaries
        parts = re.split(r'(?<=[.!?:])\s+', line)
        for part in parts:
            part = part.strip()
            # Skip very short or very long
            if len(part) < 15 or len(part) > 500:
                continue
            # Must have at least some Basque/Zuberotarra markers
            basque_chars = len([c for c in part.lower() if c in 'aáeéiíoóuúübcdfghjklmnñprstxyz'])
            if basque_chars < 10:
                continue
            sentences.append(part)
    return sentences


def main():
    all_texts = []
    all_sentences = []
    total_urls = 0
    successful = 0
    
    # ── Scrape static pages ──────────────────────────────────────────────
    print("=" * 60)
    print("SCRAPING STATIC PAGES (pastoral texts, etc.)")
    print("=" * 60)
    
    for name, url in STATIC_PAGES:
        total_urls += 1
        print(f"\n{name}:")
        time.sleep(2)  # Be nice to Wayback
        html = fetch(url)
        if not html:
            continue
        
        if 'has not archived' in html:
            print(f"  Not archived at this date")
            continue
        
        text = extract_full_page_text(html, name)
        text = filter_zuberotarra(text)
        
        if text:
            # Save raw
            fname = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
            out_path = OUT_DIR / f"{fname}.txt"
            out_path.write_text(text, encoding='utf-8')
            
            sentences = sentences_from_text(text)
            all_texts.append(text)
            all_sentences.extend(sentences)
            successful += 1
            print(f"  → {len(sentences)} sentences ({len(text.split(chr(10)))} lines), saved to {out_path.name}")
        else:
            print(f"  → No Zuberotarra content extracted")
    
    # ── Scrape blog listing ──────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print("SCRAPING BLOG ARTICLES")
    print("=" * 60)
    
    for url in BLOG_LISTING_URLS:
        total_urls += 1
        offset = re.search(r'limitstart=(\d+)', url)
        label = f"page {int(offset.group(1))//5 + 1}" if offset else "main page"
        print(f"\nBlog {label}:")
        time.sleep(2)
        html = fetch(url)
        if not html:
            continue
        
        articles = extract_blog_articles(html)
        if not articles:
            print(f"  No articles found")
            continue
        
        print(f"  Found {len(articles)} articles")
        for art in articles:
            text = filter_zuberotarra(art['text'])
            if text:
                sentences = sentences_from_text(text)
                all_texts.append(text)
                all_sentences.extend(sentences)
                successful += 1
                print(f"    - {art['title'][:70]:70s} {len(sentences):4d} sentences")
    
    # ── Save output ─────────────────────────────────────────────────────
    # Raw combined text
    raw_path = OUT_DIR / "suazia_all_raw.txt"
    raw_path.write_text("\n\n" + "=" * 60 + "\n\n".join(all_texts), encoding='utf-8')
    
    # Training format with zuberera label
    train_lines = []
    for s in all_sentences:
        clean = s.replace('\n', ' ').replace('\r', ' ').strip()
        if clean:
            train_lines.append(f"__label__zuberera {clean}")
    
    train_path = OUT_DIR / "suazia_train.txt"
    train_path.write_text("\n".join(train_lines) + "\n", encoding='utf-8')
    
    # Stats
    total_chars = sum(len(s) for s in all_sentences)
    
    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    print(f"URLs fetched:   {total_urls}")
    print(f"Pages with text: {successful}")
    print(f"Total sentences: {len(all_sentences)}")
    print(f"Total characters: {total_chars:,}")
    print(f"Avg sentence:    {total_chars//max(len(all_sentences), 1)} chars")
    print(f"Raw text:        {raw_path}")
    print(f"Training data:   {train_path}")
    print(f"Train file size: {train_path.stat().st_size / 1024:.0f} KB")
    
    # Show samples
    print(f"\nSample sentences:")
    for s in all_sentences[:8]:
        print(f"  {s[:130]}")
    
    return train_path, len(all_sentences)


if __name__ == "__main__":
    main()
