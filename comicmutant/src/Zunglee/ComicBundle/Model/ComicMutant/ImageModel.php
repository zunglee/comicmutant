<?php

namespace Zunglee\ComicBundle\Model\ComicMutant;

use Zunglee\ComicBundle\Model\AbstractBaseModel;

/**
 * Description of ImageModel
 *
 * @author ankitesh
 */
class ImageModel extends AbstractBaseModel {

    private $iconSrc;
    private $bannerSrc;

    public function getConverterMap() {
        return array(
            'comic_id' => "comicId",
            'superhero_id' => "superHeroId",
            'comic_name' => "comicName",
            'comic_info' => "comicInfo",
        );
    }

}
