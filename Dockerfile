FROM php:8.2-apache

COPY public/ /var/www/html/

# RenderはPORT=10000とかを使うので固定でOK
RUN sed -i 's/80/10000/g' /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf

RUN a2enmod rewrite