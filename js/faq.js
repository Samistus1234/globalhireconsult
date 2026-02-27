/* ============================================
   GLOBALHIRE@ELAB — FAQ Accordion
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var items = document.querySelectorAll('.accordion-item');

    items.forEach(function(item) {
      var trigger = item.querySelector('.accordion-trigger');
      if (!trigger) return;

      trigger.addEventListener('click', function() {
        var wasOpen = item.classList.contains('open');

        // Close all items in the same accordion
        var accordion = item.closest('.accordion');
        if (accordion) {
          accordion.querySelectorAll('.accordion-item.open').forEach(function(openItem) {
            openItem.classList.remove('open');
          });
        }

        // Toggle clicked item
        if (!wasOpen) {
          item.classList.add('open');
        }
      });
    });
  });
})();
