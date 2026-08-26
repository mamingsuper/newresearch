import { ArrowLeft, Crosshair } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function NotFound() {
  const { lang } = useApp();

  return (
    <div className="not-found product-page anim-fade-up">
      <div className="not-found-mark" aria-hidden="true" data-reveal>
        <Crosshair size={30} weight="duotone" />
      </div>
      <p className="section-kicker" data-reveal>404 · SIGNAL NOT FOUND</p>
      <h1 data-reveal>{lang === "zh" ? "这个坐标没有页面" : "Nothing is mapped here"}</h1>
      <p data-reveal>
        {lang === "zh"
          ? "链接可能已经失效，或页面已被移动。返回首页可以重新开始检索。"
          : "The link may be outdated or the page may have moved. Return home to start a new search."}
      </p>
      <Link to="/" className="primary-cta" data-reveal>
        <ArrowLeft size={15} /> {lang === "zh" ? "返回首页" : "Return home"}
      </Link>
    </div>
  );
}
