# Supply a tested web export; no Node, source, or secrets in the image.
FROM nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94
COPY infra/vps/web-nginx.conf /etc/nginx/nginx.conf
COPY dist/ /usr/share/nginx/html/
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
