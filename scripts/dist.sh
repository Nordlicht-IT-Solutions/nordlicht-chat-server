stat dist || mkdir dist
rm dist/$npm_package_name.zip
zip dist/$npm_package_name.zip -r build package.json package-lock.json .npmrc
