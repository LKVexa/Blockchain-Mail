import { createFileRoute } from "@tanstack/react-router";
import { GlyphokuStudio } from "@/components/glyphoku/studio";

export const Route = createFileRoute("/")({ component: GlyphokuStudio });
