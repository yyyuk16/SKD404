$(function() {
    // 1. おにぎりシール（一覧）をクリックしてモーダルを開く
    $('.onigiri-cup').on('click', function() {
        // データの取得
        const $item = $(this).closest('.onigiri-item');
        const name = $item.find('.onigiri-name').text();
        const imgSrc = $(this).find('img').attr('src');
        
        // モーダル内要素の初期化
        $('#modal-name').text(name);
        $('#modal-img').attr('src', imgSrc);
        $('#download-btn').attr('href', imgSrc);
        
        // アニメーションクラスを一度除去しておく
        $('.modal-img-wrap').removeClass('is-puru-shake');
        
        // 表示
        $('#onigiri-modal').fadeIn(250);
    });

    // 2. 閉じる処理（ボタン または 背景クリック）
    $('.close-btn, .modal-overlay').on('click', function(e) {
        if (e.target !== e.currentTarget && !$(e.target).hasClass('close-btn')) return;
        $('#onigiri-modal').fadeOut(200);
    });

    // 3. モーダル内のおにぎりクリックで「ぷるぷる」
    $('.modal-img-wrap').on('click', function() {
        const $el = $(this);
        
        // クラスを付け替えてアニメーションを再トリガー
        $el.removeClass('is-puru-shake');
        void this.offsetWidth; // 強制再レンダリング（リセットに必要）
        $el.addClass('is-puru-shake');
    });
});