(() => {
  if (!document.querySelector('[data-image-zoom], [data-article-html]')) return;
  const galleries = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const gallery of document.querySelectorAll('[data-gallery]')) {
    const slides = [...gallery.querySelectorAll('[data-gallery-slide]')];
    if (slides.length < 2) continue;
    const controls = gallery.querySelector('.gallery-controls');
    const stage = gallery.querySelector('.gallery-stage');
    const status = gallery.querySelector('.gallery-status');
    const dots = [...controls.querySelectorAll('[data-gallery-index]')];
    const steps = [...controls.querySelectorAll('[data-gallery-step]')];
    const images = slides.map(slide => slide.querySelector('img'));
    let index = 0;
    let requested = 0;
    let revision = 0;
    let departing;
    let arrival;

    function slideIn(previous) {
      const direction = Math.sign(index - previous);
      if (!direction || reducedMotion.matches || !images[previous].naturalWidth || !images[index].naturalWidth) return;
      const clone = images[previous].cloneNode();
      clone.classList.add('gallery-departing');
      clone.alt = '';
      clone.setAttribute('aria-hidden', 'true');
      clone.loading = 'eager';
      stage.append(clone);
      departing = clone;
      const options = { duration: 320, easing: 'cubic-bezier(.25, .1, .3, 1)' };
      clone.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-direction * 100}%)` }], options)
        .onfinish = () => clone.remove();
      arrival = slides[index].animate([{ transform: `translateX(${direction * 100}%)` }, { transform: 'translateX(0)' }], options);
    }

    function render(next, animate) {
      const previous = index;
      if (previous !== next || !animate) {
        arrival?.cancel();
        departing?.remove();
      }
      const restoreFocus = previous !== next && slides[previous] === document.activeElement;
      index = next;
      slides.forEach((slide, position) => { slide.hidden = position !== index; });
      dots.forEach((dot, position) => dot.setAttribute('aria-pressed', String(position === index)));
      steps[0].disabled = index === 0;
      steps[1].disabled = index === slides.length - 1;
      status.textContent = `第 ${index + 1} 张，共 ${slides.length} 张图片`;
      for (const image of images.slice(Math.max(0, index - 1), index + 2)) image.loading = 'eager';
      if (restoreFocus) slides[index].focus({ preventScroll: true });
      const dot = dots[index];
      const track = dot.parentElement;
      const dotBox = dot.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      if (dotBox.right > trackBox.right) track.scrollLeft += dotBox.right - trackBox.right;
      else if (dotBox.left < trackBox.left) track.scrollLeft -= trackBox.left - dotBox.left;
      if (animate) slideIn(previous);
    }

    function select(next, animate = false) {
      const target = Math.min(slides.length - 1, Math.max(0, next));
      const change = ++revision;
      requested = target;
      const image = images[target];
      const commit = () => {
        if (change === revision) render(target, animate);
      };
      if (animate && !image.complete) {
        image.loading = 'eager';
        image.decode().then(commit, commit);
      } else commit();
    }

    controls.hidden = false;
    select(0);
    controls.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      select(button.dataset.galleryIndex === undefined ? requested + Number(button.dataset.galleryStep) : Number(button.dataset.galleryIndex), true);
    });
    gallery.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      select(requested + (event.key === 'ArrowLeft' ? -1 : 1), true);
    });
    galleries.set(gallery, { slides, select });
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'image-lightbox';
  dialog.setAttribute('aria-label', '图片大图');
  dialog.innerHTML = `
<div class="lightbox-panel">
  <button class="icon-button lightbox-close" type="button" aria-label="关闭大图" autofocus>×</button>
  <img alt="">
  <div class="lightbox-steps">
    <button class="icon-button gallery-arrow" type="button" data-step="-1" aria-label="上一张图片"></button>
    <span aria-live="polite"></span>
    <button class="icon-button gallery-arrow" type="button" data-step="1" aria-label="下一张图片"></button>
  </div>
</div>`;
  document.body.append(dialog);
  const photo = dialog.querySelector('img');
  const steps = dialog.querySelector('.lightbox-steps');
  const previous = steps.querySelector('[data-step="-1"]');
  const next = steps.querySelector('[data-step="1"]');
  let slides, index, gallery;

  function show(position) {
    index = Math.min(slides.length - 1, Math.max(0, position));
    const link = slides[index];
    photo.src = link.href;
    photo.alt = link.querySelector('img')?.alt || '';
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    steps.querySelector('span').textContent = `${index + 1} / ${slides.length}`;
    gallery?.select(index);
  }

  function open(event) {
    const link = event.target.closest('[data-image-zoom]');
    if (!link || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || dialog.open) return;
    event.preventDefault();
    gallery = galleries.get(link.closest('[data-gallery]'));
    slides = gallery?.slides || [link];
    steps.hidden = slides.length < 2;
    show(slides.indexOf(link));
    dialog.showModal();
  }

  document.addEventListener('click', open);
  for (const frame of document.querySelectorAll('[data-article-html]')) {
    const prepare = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      for (const image of body.querySelectorAll('img[src]')) {
        if (image.closest('a, button') || !/^(?:https?:|data:)/.test(image.src)) continue;
        const link = body.ownerDocument.createElement('a');
        link.href = image.src;
        link.dataset.imageZoom = '';
        link.setAttribute('aria-label', image.alt ? `查看大图：${image.alt}` : '查看大图');
        image.before(link);
        link.append(image);
      }
      body.addEventListener('click', open);
    };
    frame.addEventListener('load', prepare);
    prepare();
  }
  dialog.querySelector('.lightbox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
    const step = event.target.closest('[data-step]');
    if (step) show(index + Number(step.dataset.step));
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    show(index + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    photo.removeAttribute('src');
    slides[index].focus();
  });
})();
