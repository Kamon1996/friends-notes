#!/usr/bin/env bash
# Оставляет на GitHub только релизы версий из «Что нового» (src/lib/changelog.ts) и пишет в них описание оттуда же;
# остальные релизы удаляет вместе с тегами, теги версий без релиза — тоже. Запуск — workflow «Releases tidy».
#   bash scripts/releases/tidy.sh notes.json   (notes.json — вывод scripts/releases/notes.ts)
set -euo pipefail
NOTES="$1"
REPO="$GITHUB_REPOSITORY"

# Защита: если описания не собрались, не удаляем ничего.
count=$(jq 'length' "$NOTES")
current=$(node -p "require('./app.json').expo.version")
if [ "$count" -lt 3 ] || ! jq -e --arg v "$current" 'has($v)' "$NOTES" >/dev/null; then
  echo "::error::В истории изменений $count версий и нет текущей $current — ничего не трогаю"
  exit 1
fi
keep() { jq -e --arg v "${1#v}" 'has($v)' "$NOTES" >/dev/null; }

kept=(); deleted=()
for tag in $(gh release list --repo "$REPO" --limit 300 --json tagName --jq '.[].tagName'); do
  if keep "$tag"; then
    gh release edit "$tag" --repo "$REPO" --notes "$(jq -r --arg v "${tag#v}" '.[$v]' "$NOTES")" >/dev/null
    kept+=("$tag")
  else
    gh release delete "$tag" --repo "$REPO" --yes
    gh api -X DELETE "repos/$REPO/git/refs/tags/$tag" >/dev/null 2>&1 || echo "::warning::Тег $tag не удалился"
    deleted+=("$tag")
  fi
done
for tag in $(gh api "repos/$REPO/tags?per_page=100" --paginate --jq '.[].name | select(startswith("v"))'); do
  if ! keep "$tag"; then
    gh api -X DELETE "repos/$REPO/git/refs/tags/$tag" >/dev/null 2>&1 && deleted+=("$tag (тег)") || echo "::warning::Тег $tag не удалился"
  fi
done

{
  echo "### Релизы: оставлено ${#kept[@]}, удалено ${#deleted[@]}"
  echo ""
  echo "Оставлены: ${kept[*]:-—}"
  echo ""
  echo "Удалены: ${deleted[*]:-—}"
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
echo "Оставлены: ${kept[*]:-—}"
echo "Удалены: ${deleted[*]:-—}"
