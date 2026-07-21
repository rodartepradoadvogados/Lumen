"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "@/app/homepage.module.css";

// Carrossel de 2 slides do banner inicial — um sobre o Blog Jurídico, outro sobre o produto
// Gestão Jurídica. Troca sozinho a cada alguns segundos e por clique nos indicadores; simples
// de propósito ("por hora, faça — depois vamos melhorando"), sem biblioteca externa.
const SLIDES = [
  {
    key: "blog",
    image: "/homepage/carousel-blog.webp",
    alt: "Mesa de trabalho com anotações, destaques e leitura de fontes para uma matéria",
    eyebrow: "Blog jurídico",
    title: (
      <>
        O direito muda todo dia.
        <br />A gente lê <em>primeiro</em>.
      </>
    ),
    sub: "Decisões de tribunais superiores, mudanças de lei e teses vinculantes — resumidas todos os dias, com as fontes originais linkadas para você conferir.",
    primary: { label: "Ler o blog", href: "#leitura" },
    secondary: { label: "Conhecer o Gestão Jurídica", href: "#funcionalidades" },
  },
  {
    key: "produto",
    image: "/homepage/carousel-produto.webp",
    alt: "Pesquisa e organização de conteúdo em ambiente de biblioteca, com tablet e anotações",
    eyebrow: "Software de gestão jurídica",
    title: (
      <>
        Gestão de verdade não é planilha.
        <br />É saber o que <em>mudou hoje</em>.
      </>
    ),
    sub: "Processos, prazos, financeiro e atendimento em um só lugar — com um blog jurídico atualizado todos os dias.",
    primary: { label: "Conhecer o Gestão Jurídica", href: "#funcionalidades" },
    secondary: { label: "Ler o blog", href: "#leitura" },
  },
];

const INTERVAL_MS = 7000;

export default function HomepageHeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {SLIDES.map((slide, i) => (
        <div key={slide.key} className={styles.heroSlide} style={{ opacity: i === active ? 1 : 0, zIndex: i === active ? 1 : 0 }}>
          <div className={styles.heroImageWrap}>
            <Image src={slide.image} alt={slide.alt} fill priority={i === 0} sizes="100vw" style={{ objectFit: "cover" }} />
          </div>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>{slide.eyebrow}</span>
            <h1 className={styles.heroTitle}>{slide.title}</h1>
            <p className={styles.heroSub}>{slide.sub}</p>
            <div className={styles.heroCtas}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={slide.primary.href}>
                {slide.primary.label}
              </a>
              <a className={`${styles.btn} ${styles.btnGhost}`} href={slide.secondary.href}>
                {slide.secondary.label}
              </a>
            </div>
          </div>
        </div>
      ))}
      <div className={styles.heroDots} role="tablist" aria-label="Slides do banner">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            role="tab"
            aria-selected={i === active}
            aria-label={slide.eyebrow}
            onClick={() => setActive(i)}
            className={`${styles.heroDot} ${i === active ? styles.heroDotActive : ""}`}
          />
        ))}
      </div>
    </>
  );
}
