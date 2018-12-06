<?php

namespace Zunglee\ComicBundle\Model\ComicMutant;

use Zunglee\ComicBundle\Model\AbstractBaseModel;

/**
 * Description of ComicSuperHeroModel
 *
 * @author ankitesh
 */
class ComicSuperHeroModel extends AbstractBaseModel {

    private $comicId;
    private $superHeroId;
    private $comicName;
    private $summary;
    private $nickName;
    private $power;
    private $weakness;
    private $alterEgo;
    private $iconSrc;
    private $bannerSrc;

    public function getConverterMap() {
        return array(
            'comic_id' => "comicId",
            'superhero_id' => "superHeroId",
            'comic_name' => "comicName",
            'summary' => "summary",
        );
    }

    function getComicId() {
        return $this->comicId;
    }

    function getSuperHeroId() {
        return $this->superHeroId;
    }

    function getComicName() {
        return $this->comicName;
    }

    function getSummary() {
        return $this->summary;
    }

    function setComicId($comicId) {
        $this->comicId = $comicId;
    }

    function setSuperHeroId($superHeroId) {
        $this->superHeroId = $superHeroId;
    }

    function setComicName($comicName) {
        $this->comicName = $comicName;
    }

    function setSummary($summary) {
        $data = json_decode($summary, true);
        $this->summary = $data;
        $power = $data["power"];
        $weekness = $data["weekness"];
        $alterEgo = $data["alterEgo"];
        $iconSrc = $data["iconSrc"];
        $bannerSrc = $data["bannerSrc"];
        $this->setPower($power);
        $this->setWeakness($weekness);
        $this->setAlterEgo($alterEgo);
        $this->setIconSrc($iconSrc);
        $this->setBannerSrc($bannerSrc);
    }

    function getNickName() {
        return $this->nickName;
    }

    function getPower() {
        return $this->power;
    }

    function getWeakness() {
        return $this->weakness;
    }

    function getAlterEgo() {
        return $this->alterEgo;
    }

    function getIconSrc() {
        return $this->iconSrc;
    }

    function getBannerSrc() {
        return $this->bannerSrc;
    }

    function setNickName($nickName) {
        $this->nickName = $nickName;
    }

    function setPower($power) {
        $this->power = $power;
    }

    function setWeakness($weakness) {
        $this->weakness = $weakness;
    }

    function setAlterEgo($alterEgo) {
        $this->alterEgo = $alterEgo;
    }

    function setIconSrc($iconSrc) {
        $this->iconSrc = $iconSrc;
    }

    function setBannerSrc($bannerSrc) {
        $this->bannerSrc = $bannerSrc;
    }

}
